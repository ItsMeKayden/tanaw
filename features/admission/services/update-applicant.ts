import { revalidatePath } from "next/cache";

import { getAccountId } from "@/lib/authorization";
import { APPLICANT_BASE_PATH, APPLICANT_LIST_PATHS } from "@/features/admission/access";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import {
  assertReferencesExist,
  parseApplicantForm,
  resolveSchoolId,
  saveApplicationDocuments,
  type ApplicantActionError,
} from "@/features/admission/applicant-form.server";
import { getDraftStepIds } from "@/features/admission/draft-data";
import { prisma } from "@/lib/prisma";

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function updateApplicantForUser(
  formData: FormData,
  user: { id?: string | null },
): Promise<{ success: true } | ApplicantActionError> {
  const applicantId = parseId(formData.get("applicant_id"));
  const applicationId = parseId(formData.get("application_id"));
  if (!applicantId || !applicationId) {
    return { error: "Invalid applicant or application ID." };
  }

  const parsed = await parseApplicantForm(formData);
  if ("error" in parsed) return parsed;
  const { applicant, application, school, documents, removeDocuments } = parsed.data;

  try {
    const accountId = getAccountId(user);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.tbl_application.findFirst({
        where: {
          application_id: applicationId,
          applicant_id: applicantId,
          ...ACTIVE_APPLICATION,
        },
        select: { application_id: true },
      });
      if (!existing) throw new Error("The applicant's application could not be found.");

      await assertReferencesExist(tx, application);
      const schoolId = await resolveSchoolId(tx, school);
      await tx.tbl_applicant.update({ where: { applicant_id: applicantId }, data: applicant });
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
      await tx.tbl_admission_draft.deleteMany({
        where: {
          user_id: accountId,
          step_id: { in: getDraftStepIds("edit", applicantId) },
        },
      });
    });

    for (const path of APPLICANT_LIST_PATHS) revalidatePath(path);
    for (const base of Object.values(APPLICANT_BASE_PATH)) {
      revalidatePath(`${base}/${applicantId}`);
    }
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
