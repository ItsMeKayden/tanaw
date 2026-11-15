"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  assertReferencesExist,
  parseApplicantForm,
  resolveSchoolId,
  saveApplicationDocuments,
  type ApplicantActionError,
} from "@/features/admission/applicant-form.server";

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Updates an applicant and the given application. Application number, date,
 * cycle, and stage are never changed here.
 */
export async function updateApplicant(
  formData: FormData,
): Promise<{ success: true } | ApplicantActionError> {
  const user = await requirePermission("admission", "write");

  const applicantId = parseId(formData.get("applicant_id"));
  const applicationId = parseId(formData.get("application_id"));

  if (!applicantId || !applicationId) {
    return { error: "Invalid applicant or application ID." };
  }

  const parsed = await parseApplicantForm(formData);
  if ("error" in parsed) return parsed;

  const { applicant, application, school, documents, removeDocuments } =
    parsed.data;

  try {
    const accountId = getAccountId(user);

    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.tbl_application.findFirst({
          where: { application_id: applicationId, applicant_id: applicantId },
          select: { application_id: true },
        });

        if (!existing) {
          throw new Error("The applicant's application could not be found.");
        }

        await assertReferencesExist(tx, application);
        const schoolId = await resolveSchoolId(tx, school);

        await tx.tbl_applicant.update({
          where: { applicant_id: applicantId },
          data: applicant,
        });

        await tx.tbl_application.update({
          where: { application_id: applicationId },
          data: { ...application, school_id: schoolId },
        });

        await saveApplicationDocuments(
          tx,
          applicationId,
          accountId,
          documents,
          removeDocuments,
        );
      },
    );

    revalidatePath("/admission");
    revalidatePath(`/admission/applicants/${applicantId}`);

    return { success: true };
  } catch (error) {
    console.error("Update applicant error:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong while updating the applicant.",
    };
  }
}
