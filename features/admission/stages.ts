/**
 * Canonical admission pipeline stages (tbl_admission_stage.stage_name).
 *
 * Application Submitted → For Examination → Exam Completed → Passed | Waitlisted | Failed
 * Waitlisted → (slot opens, Additional Applicants) → Passed
 * Passed → (enrollment requirements verified) → Enrolled | Not Enrolled
 *
 * Waitlisted = the waiting list: applicants who passed the exam after their
 * course's quota was already full.
 */
export const ADMISSION_STAGES = {
  APPLICATION_SUBMITTED: "Application Submitted",
  FOR_EXAMINATION: "For Examination",
  EXAM_COMPLETED: "Exam Completed",
  PASSED: "Passed",
  WAITLISTED: "Waitlisted",
  FAILED: "Failed",
  ENROLLED: "Enrolled",
  NOT_ENROLLED: "Not Enrolled",
} as const;

export type AdmissionStageName =
  (typeof ADMISSION_STAGES)[keyof typeof ADMISSION_STAGES];

/** Stage names in pipeline order, used for seeding and filters. */
export const ADMISSION_STAGE_ORDER: AdmissionStageName[] = [
  ADMISSION_STAGES.APPLICATION_SUBMITTED,
  ADMISSION_STAGES.FOR_EXAMINATION,
  ADMISSION_STAGES.EXAM_COMPLETED,
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.WAITLISTED,
  ADMISSION_STAGES.FAILED,
  ADMISSION_STAGES.ENROLLED,
  ADMISSION_STAGES.NOT_ENROLLED,
];

/**
 * Stages that use up a quota slot. Not Enrolled gives the slot back, so it
 * can go to the next Waitlisted applicant.
 */
export const SLOT_HOLDING_STAGES: readonly string[] = [ADMISSION_STAGES.PASSED, ADMISSION_STAGES.ENROLLED];

/**
 * Stages that are only set through Enrollment Verification, never through
 * the generic "Update Admission Stage" form.
 */
export const ENROLLMENT_DECISION_STAGES: readonly string[] = [
  ADMISSION_STAGES.ENROLLED,
  ADMISSION_STAGES.NOT_ENROLLED,
];

/** Stages shown on the Enrollment Verification page (admitted applicants). */
export const ADMITTED_STAGES: readonly string[] = [
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.ENROLLED,
  ADMISSION_STAGES.NOT_ENROLLED,
];

/** tbl_exam_result.result_status value for a passing result. */
export const EXAM_RESULT_PASSED = "PASSED";

/** Tailwind classes for a stage badge. */
export function stageBadgeClass(stageName: string | null | undefined) {
  return `ring-1 ring-inset ${STAGE_TONES[stageName ?? ""] ?? STAGE_TONES.default}`;
}

/**
 * One soft tint per stage, from neutral (just applied) through blue (exam)
 * to green (passed / enrolled); amber = waiting, red = failed, grey = left.
 */
const STAGE_TONES: Record<string, string> = {
  [ADMISSION_STAGES.APPLICATION_SUBMITTED]: "bg-slate-100 text-slate-700 ring-slate-300",
  [ADMISSION_STAGES.FOR_EXAMINATION]: "bg-sky-50 text-sky-800 ring-sky-200",
  [ADMISSION_STAGES.EXAM_COMPLETED]: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  [ADMISSION_STAGES.PASSED]: "bg-green-50 text-green-800 ring-green-200",
  [ADMISSION_STAGES.WAITLISTED]: "bg-amber-50 text-amber-900 ring-amber-300",
  [ADMISSION_STAGES.FAILED]: "bg-red-50 text-red-800 ring-red-200",
  [ADMISSION_STAGES.ENROLLED]: "bg-emerald-600 text-white ring-emerald-600",
  [ADMISSION_STAGES.NOT_ENROLLED]: "bg-neutral-100 text-neutral-600 ring-neutral-300",
  default: "bg-[#e3e4f8] text-[#191e73] ring-[#191e73]/20",
};
