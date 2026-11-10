"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function parseId(value: unknown): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function deleteApplicant(applicantIdInput: unknown) {
  await requirePermission("admission", "write");

  const applicantId = parseId(applicantIdInput);

  if (!applicantId) {
    return { error: "Invalid applicant ID." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Verify that the applicant exists.
      const applicant = await tx.tbl_applicant.findUnique({
        where: { applicant_id: applicantId },
        select: { applicant_id: true },
      });

      if (!applicant) {
        throw new Error("Applicant not found.");
      }

      // 2. Get all applications belonging to this applicant.
      const applications = await tx.tbl_application.findMany({
        where: { applicant_id: applicantId },
        select: { application_id: true },
      });

      const applicationIds = applications.map(
        (application) => application.application_id,
      );

      // 3. Block deletion if any application has an exam result.
      if (applicationIds.length > 0) {
        const examResult = await tx.tbl_exam_result.findFirst({
          where: {
            application_id: {
              in: applicationIds,
            },
          },
          select: {
            result_id: true,
          },
        });

        if (examResult) {
          throw new Error(
            "This applicant cannot be deleted because examination records exist. Please preserve the applicant's examination history.",
          );
        }
      }

      // 4. Delete the applicant's applications first.
      // Related stage logs and course recommendations
      // are automatically deleted through database cascades.
      await tx.tbl_application.deleteMany({
        where: { applicant_id: applicantId },
      });

      // 5. Delete the applicant.
      await tx.tbl_applicant.delete({
        where: { applicant_id: applicantId },
      });
    });

    revalidatePath("/admission");

    return { success: true as const };
  } catch (error) {
    console.error("Delete applicant error:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong while deleting the applicant.",
    };
  }
}
