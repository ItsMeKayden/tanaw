"use server";

import { getAccountId, requireAnyPermission } from "@/lib/authorization";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ENROLLMENT_DECISION_STAGES } from "@/features/admission/stages";
import { stageUpdateSchema } from "@/features/admission/schemas";

type UpdateApplicationStageInput = {
  application_id: number;
  stage_id: number;
  remarks?: string;
};

export async function updateApplicationStage(
  input: UpdateApplicationStageInput,
) {
  const user = await requireAnyPermission(APPLICANT_EDIT_MODULES, "write");
  const accountId = getAccountId(user);

  const { application_id, stage_id } = input;

  if (!Number.isInteger(application_id) || application_id <= 0) {
    throw new Error("Invalid application or stage.");
  }

  const parsed = stageUpdateSchema.safeParse({
    stage_id: String(stage_id),
    remarks: input.remarks ?? "",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const remarks = parsed.data.remarks;

  const application = await prisma.tbl_application.findUnique({
    where: { application_id, ...ACTIVE_APPLICATION },
    select: {
      application_id: true,
      current_stage_id: true,
    },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  const stage = await prisma.tbl_admission_stage.findUnique({
    where: { stage_id },
    select: {
      stage_id: true,
      stage_name: true,
    },
  });

  if (!stage) {
    throw new Error("Admission stage not found.");
  }

  // Enrollment decisions must go through Enrollment Verification.
  if (ENROLLMENT_DECISION_STAGES.includes(stage.stage_name)) {
    throw new Error(
      `Applicants can only be marked "${stage.stage_name}" through Enrollment Verification.`,
    );
  }

  if (application.current_stage_id === stage_id) {
    throw new Error("This application is already in the selected stage.");
  }

  const cleanRemarks = remarks?.trim() || null;

  await prisma.$transaction([
    prisma.tbl_application.update({
      where: { application_id },
      data: {
        current_stage_id: stage_id,
      },
    }),

    prisma.tbl_application_stage_log.create({
      data: {
        application_id,
        stage_id,
        changed_by: accountId,
        remarks: cleanRemarks,
      },
    }),
  ]);

  return {
    success: true,
    message: "Admission stage updated successfully.",
  };
}
