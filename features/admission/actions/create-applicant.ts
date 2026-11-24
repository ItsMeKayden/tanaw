"use server";

import { requireAnyPermission } from "@/lib/authorization";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { createApplicantForUser } from "@/features/admission/services/create-applicant";
import type { ApplicantActionError } from "@/features/admission/applicant-form.server";

export async function createApplicant(
  formData: FormData,
): Promise<{ success: true; applicantId: number } | ApplicantActionError> {
  const user = await requireAnyPermission(APPLICANT_EDIT_MODULES, "write");
  return createApplicantForUser(formData, user);
}
