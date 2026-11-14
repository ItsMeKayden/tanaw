"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requireAnyPermission } from "@/lib/authorization";
import type { ModuleName } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { enrollmentDecisionSchema, notEnrolledSchema } from "@/features/admission/schemas";

/**
 * Enrollment verification records its decisions as stage changes
 * (Passed → Enrolled / Not Enrolled) in tbl_application_stage_log, so
 * "verified by" is the log's changed_by and the notes are its remarks.
 */

const VERIFIER_MODULES: ModuleName[] = ["admission", "registrar"];

type ActionResult = { success: true; message: string } | { error: string };

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateEnrollmentPaths(applicationId: number) {
  revalidatePath("/admission/enrollment-verification");
  revalidatePath(`/admission/enrollment-verification/${applicationId}`);
  revalidatePath("/admission");
}

/**
 * Moves an application between two stages inside a transaction, guarding
 * against concurrent changes, and writes a stage log entry.
 */
async function transitionStage(options: {
  applicationId: number;
  from: string;
  to: string;
  accountId: number;
  remarks: string;
  requirePassedExam?: boolean;
}) {
  const { applicationId, from, to, accountId, remarks } = options;

  await prisma.$transaction(async (tx) => {
    const stages = await tx.tbl_admission_stage.findMany({
      where: { stage_name: { in: [from, to] } },
      select: { stage_id: true, stage_name: true },
    });
    const fromStage = stages.find((s) => s.stage_name === from);
    const toStage = stages.find((s) => s.stage_name === to);

    if (!fromStage || !toStage) {
      throw new Error(`The "${from}" or "${to}" admission stage is missing.`);
    }

    if (options.requirePassedExam) {
      const passed = await tx.tbl_exam_result.findFirst({
        where: { application_id: applicationId, result_status: EXAM_RESULT_PASSED },
        select: { result_id: true },
      });
      if (!passed) {
        throw new Error("This application has no PASSED examination result on record.");
      }
    }

    const updated = await tx.tbl_application.updateMany({
      where: { application_id: applicationId, current_stage_id: fromStage.stage_id },
      data: { current_stage_id: toStage.stage_id },
    });

    if (updated.count !== 1) {
      throw new Error(
        `Only applications in the "${from}" stage can be changed to "${to}". Please reload and try again.`,
      );
    }

    await tx.tbl_application_stage_log.create({
      data: {
        application_id: applicationId,
        stage_id: toStage.stage_id,
        changed_by: accountId,
        remarks,
      },
    });
  });
}

async function runTransition(
  input: { application_id: number; remarks?: string },
  config: {
    from: string;
    to: string;
    schema: typeof enrollmentDecisionSchema | typeof notEnrolledSchema;
    defaultRemarks: string;
    requirePassedExam?: boolean;
    successMessage: string;
  },
): Promise<ActionResult> {
  const user = await requireAnyPermission(VERIFIER_MODULES, "write");

  const applicationId = parseId(input.application_id);
  if (!applicationId) return { error: "Invalid application." };

  const parsed = config.schema.safeParse({ remarks: input.remarks ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const remarks = parsed.data.remarks || null;

  try {
    await transitionStage({
      applicationId,
      from: config.from,
      to: config.to,
      accountId: getAccountId(user),
      remarks: remarks ?? config.defaultRemarks,
      requirePassedExam: config.requirePassedExam,
    });
    revalidateEnrollmentPaths(applicationId);
    return { success: true, message: config.successMessage };
  } catch (error) {
    console.error(`Enrollment transition ${config.from} → ${config.to} error:`, error);
    return {
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/** Passed → Enrolled. Requires a PASSED exam result. */
export async function verifyEnrollment(input: {
  application_id: number;
  remarks?: string;
}) {
  return runTransition(input, {
    from: ADMISSION_STAGES.PASSED,
    to: ADMISSION_STAGES.ENROLLED,
    schema: enrollmentDecisionSchema,
    defaultRemarks: "Enrollment verified.",
    requirePassedExam: true,
    successMessage: "Applicant verified as enrolled.",
  });
}

/** Passed → Not Enrolled (declined / no-show). Reason required. */
export async function markNotEnrolled(input: {
  application_id: number;
  remarks?: string;
}) {
  return runTransition(input, {
    from: ADMISSION_STAGES.PASSED,
    to: ADMISSION_STAGES.NOT_ENROLLED,
    schema: notEnrolledSchema,
    defaultRemarks: "",
    successMessage: "Applicant marked as not enrolled.",
  });
}

/** Not Enrolled → Passed, so the applicant can be verified again. */
export async function reopenEnrollment(input: {
  application_id: number;
  remarks?: string;
}) {
  return runTransition(input, {
    from: ADMISSION_STAGES.NOT_ENROLLED,
    to: ADMISSION_STAGES.PASSED,
    schema: enrollmentDecisionSchema,
    defaultRemarks: "Enrollment reopened for verification.",
    successMessage: "Applicant returned to pending verification.",
  });
}
