import type { ApplicantFormValues } from "@/features/admission/applicant-form";

export const DRAFT_STEP_NAMES = ["personal", "course", "school"] as const;
export type DraftStepName = (typeof DRAFT_STEP_NAMES)[number];
export type AdmissionDraftValues = Partial<ApplicantFormValues> & {
  districtId?: string;
};

const STEP_FIELDS: Record<DraftStepName, readonly string[]> = {
  personal: [
    "last_name",
    "first_name",
    "middle_name",
    "suffix",
    "birth_date",
    "sex",
    "email",
    "mobile_no",
    "barangay_id",
    "districtId",
  ],
  course: ["program_id", "program_choice_2_id", "program_choice_3_id", "branch_id"],
  school: ["school_entry_mode", "school_id", "school_name", "school_type", "school_city"],
};

export function getDraftStepIds(mode: "create" | "edit", applicantId?: number) {
  const context = mode === "create" ? "create" : `edit-${applicantId}`;
  return DRAFT_STEP_NAMES.map((step) => `${context}-${step}`);
}

export function getDraftStepName(stepId: string): DraftStepName | null {
  const match = /^(?:create|edit-[1-9]\d*)-(personal|course|school)$/.exec(stepId);
  return (match?.[1] as DraftStepName | undefined) ?? null;
}

export function sanitizeDraftValues(
  stepId: string,
  raw: unknown,
): Record<string, string> | null {
  const step = getDraftStepName(stepId);
  if (!step || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const field of STEP_FIELDS[step]) {
    const value = source[field];
    if (typeof value !== "string" || value.length > 500) continue;
    result[field] = value;
  }
  return result;
}

export function getDraftValuesForStep(
  values: AdmissionDraftValues,
  step: DraftStepName,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of STEP_FIELDS[step]) {
    const value = values[field as keyof AdmissionDraftValues];
    if (typeof value === "string") result[field] = value;
  }
  return result;
}
