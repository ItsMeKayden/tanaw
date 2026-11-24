"use server";

import { requireAnyPermission } from "@/lib/authorization";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { updateApplicantForUser } from "@/features/admission/services/update-applicant";
import type { ApplicantActionError } from "@/features/admission/applicant-form.server";

export async function updateApplicant(
  formData: FormData,
): Promise<{ success: true } | ApplicantActionError> {
  const user = await requireAnyPermission(APPLICANT_EDIT_MODULES, "write");
  return updateApplicantForUser(formData, user);
}
