"use server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type UpdateApplicationStageInput = {
  application_id: number;
  stage_id: number;
  remarks?: string;
};

export async function updateApplicationStage(
  input: UpdateApplicationStageInput,
) {
  await requirePermission("admission", "write");

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Unauthorized. Please log in again.");
  }

  const { application_id, stage_id, remarks } = input;

  if (
    !Number.isInteger(application_id) ||
    !Number.isInteger(stage_id) ||
    application_id <= 0 ||
    stage_id <= 0
  ) {
    throw new Error("Invalid application or stage.");
  }

  const application = await prisma.tbl_application.findUnique({
    where: { application_id },
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
    },
  });

  if (!stage) {
    throw new Error("Admission stage not found.");
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
        changed_by: userId,
        remarks: cleanRemarks,
      },
    }),
  ]);

  return {
    success: true,
    message: "Admission stage updated successfully.",
  };
}
