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
 * Marks one requirement (e.g. Form 138) as verified or not. When every exam
 * requirement is verified and the applicant is still "Application
 * Submitted", they move to "For Examination" (logged with who verified).
 * Unverifying later doesn't move them back.
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
    const cleared = await prisma.$transaction(async (tx) => {
      const application = await tx.tbl_application.findFirst({
        where: { application_id: applicationId, ...ACTIVE_APPLICATION },
        select: { current_stage_id: true },
      });
      if (!application) throw new Error("Application not found.");

      if (verified) {
        await tx.tbl_application_requirement.upsert({
          where: { application_id_requirement: { application_id: applicationId, requirement } },
          update: {},
          create: { application_id: applicationId, requirement, verified_by: accountId },
        });
      } else {
        await tx.tbl_application_requirement.deleteMany({ where: { application_id: applicationId, requirement } });
        return false;
      }

      // All requirements verified → cleared for the exam.
      const done = await tx.tbl_application_requirement.count({
        where: { application_id: applicationId, requirement: { in: [...EXAM_REQUIREMENTS] } },
      });
      const { submitted, forExam } = await stageIds(tx);
      if (done < EXAM_REQUIREMENTS.length || application.current_stage_id !== submitted) return false;

      await tx.tbl_application.update({ where: { application_id: applicationId }, data: { current_stage_id: forExam } });
      await tx.tbl_application_stage_log.create({
        data: {
          application_id: applicationId,
          stage_id: forExam,
          changed_by: accountId,
          remarks: `Requirements verified (${EXAM_REQUIREMENTS.map(documentLabel).join(", ")}); cleared for the exam.`,
        },
      });
      return true;
    });

    revalidate();
    const label = documentLabel(requirement);
    if (!verified) return { success: true, message: `${label} marked as not verified.` };
    return {
      success: true,
      message: cleared
        ? `${label} verified. All requirements are complete, so the applicant is now For Examination.`
        : `${label} verified.`,
    };
  } catch (error) {
    console.error("Verify requirement error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/**
 * Bulk "Clear for exam": moves the selected "Application Submitted"
 * applicants to "For Examination" (for exceptions, e.g. requirements checked
 * outside the system). Applicants in any other stage are skipped.
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
