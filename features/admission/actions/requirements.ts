"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requireAnyPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  APPLICANT_BASE_PATH,
  APPLICANT_EDIT_MODULES,
  APPLICANT_LIST_PATHS,
  EXAM_SCHEDULE_PATHS,
} from "@/features/admission/access";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { documentLabel, EXAM_REQUIREMENTS } from "@/features/admission/documents";
import { ADMISSION_STAGES } from "@/features/admission/stages";

type ActionResult = { success: true; message: string } | { error: string };

function validId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  for (const path of APPLICANT_LIST_PATHS) revalidatePath(path);
  for (const base of Object.values(APPLICANT_BASE_PATH)) if (base) revalidatePath(base, "layout");
  for (const path of EXAM_SCHEDULE_PATHS) revalidatePath(path);
}

async function stageIds(tx: Prisma.TransactionClient) {
  const stages = await tx.tbl_admission_stage.findMany({
    where: { stage_name: { in: [ADMISSION_STAGES.APPLICATION_SUBMITTED, ADMISSION_STAGES.FOR_EXAMINATION] } },
    select: { stage_id: true, stage_name: true },
  });
  const id = (name: string) => stages.find((s) => s.stage_name === name)?.stage_id;
  const submitted = id(ADMISSION_STAGES.APPLICATION_SUBMITTED);
  const forExam = id(ADMISSION_STAGES.FOR_EXAMINATION);
  if (!submitted || !forExam) throw new Error("The admission stages are missing. Run the database seed.");
  return { submitted, forExam };
}

/**
 * Marks one document (Form 138, PSA) as verified or not. The Registrar checks
 * them on Enrollment Verification while the applicant is "Passed"; an
 * applicant can only be marked Enrolled once every one is verified. It never
 * changes the stage (Clear for exam moves applicants to For Examination).
 */
export async function setRequirementVerified(
  applicationIdInput: number,
  requirement: string,
  verified: boolean,
): Promise<ActionResult> {
  const user = await requireAnyPermission(APPLICANT_EDIT_MODULES, "write");
  const applicationId = validId(applicationIdInput);
  if (!applicationId || !EXAM_REQUIREMENTS.includes(requirement) || typeof verified !== "boolean") {
    return { error: "Invalid requirement." };
  }

  try {
    const accountId = getAccountId(user);
    const application = await prisma.tbl_application.findFirst({
      where: { application_id: applicationId, ...ACTIVE_APPLICATION },
      select: { tbl_admission_stage: { select: { stage_name: true } } },
    });
    if (!application) return { error: "Application not found." };
    if (application.tbl_admission_stage?.stage_name !== ADMISSION_STAGES.PASSED) {
      return { error: "Documents are verified during enrollment, while the applicant is in the Passed stage." };
    }

    if (verified) {
      await prisma.tbl_application_requirement.upsert({
        where: { application_id_requirement: { application_id: applicationId, requirement } },
        update: {},
        create: { application_id: applicationId, requirement, verified_by: accountId },
      });
    } else {
      await prisma.tbl_application_requirement.deleteMany({ where: { application_id: applicationId, requirement } });
    }

    revalidate();
    revalidatePath("/admission/enrollment-verification");
    revalidatePath(`/admission/enrollment-verification/${applicationId}`);
    const label = documentLabel(requirement);
    return { success: true, message: verified ? `${label} verified.` : `${label} marked as not verified.` };
  } catch (error) {
    console.error("Verify requirement error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/**
 * Bulk "Clear for exam": moves the selected "Application Submitted"
 * applicants to "For Examination". This is the only way into that stage.
 * Applicants in any other stage are skipped.
 */
export async function clearForExam(applicationIdsInput: number[]): Promise<ActionResult> {
  const user = await requireAnyPermission(APPLICANT_EDIT_MODULES, "write");
  if (!Array.isArray(applicationIdsInput) || applicationIdsInput.length === 0) return { error: "No applicants selected." };
  if (applicationIdsInput.length > 1000) return { error: "Clear at most 1,000 applicants at a time." };
  const ids = [...new Set(applicationIdsInput.map(validId))];
  if (ids.some((id) => id === null)) return { error: "Invalid applicant." };

  try {
    const accountId = getAccountId(user);
    const { moved, skipped } = await prisma.$transaction(async (tx) => {
      const { submitted, forExam } = await stageIds(tx);
      const ready = await tx.tbl_application.findMany({
        where: { application_id: { in: ids as number[] }, current_stage_id: submitted, ...ACTIVE_APPLICATION },
        select: { application_id: true },
      });
      const readyIds = ready.map((a) => a.application_id);
      if (readyIds.length > 0) {
        await tx.tbl_application.updateMany({
          where: { application_id: { in: readyIds } },
          data: { current_stage_id: forExam },
        });
        await tx.tbl_application_stage_log.createMany({
          data: readyIds.map((application_id) => ({
            application_id,
            stage_id: forExam,
            changed_by: accountId,
            remarks: "Cleared for the exam (bulk).",
          })),
        });
      }
      return { moved: readyIds.length, skipped: ids.length - readyIds.length };
    });

    revalidate();
    if (moved === 0) return { error: "None of the selected applicants are in Application Submitted." };
    const note = skipped ? ` ${skipped} skipped (not in Application Submitted).` : "";
    return {
      success: true,
      message: `${moved} applicant${moved === 1 ? "" : "s"} cleared for the exam.${note}`,
    };
  } catch (error) {
    console.error("Clear for exam error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
