/**
 * Canonical admission pipeline stages (tbl_admission_stage.stage_name).
 *
 * Application Submitted → For Examination → Exam Completed → Passed | Failed
 * Passed → (enrollment requirements verified) → Enrolled | Not Enrolled
 */
export const ADMISSION_STAGES = {
  APPLICATION_SUBMITTED: "Application Submitted",
  FOR_EXAMINATION: "For Examination",
  EXAM_COMPLETED: "Exam Completed",
  PASSED: "Passed",
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
  ADMISSION_STAGES.FAILED,
  ADMISSION_STAGES.ENROLLED,
  ADMISSION_STAGES.NOT_ENROLLED,
];

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
  switch (stageName) {
    case ADMISSION_STAGES.ENROLLED:
    case ADMISSION_STAGES.PASSED:
      return "bg-green-500 text-white";
    case ADMISSION_STAGES.FAILED:
      return "bg-red-500 text-white";
    case ADMISSION_STAGES.NOT_ENROLLED:
      return "bg-neutral-500 text-white";
    default:
      return "bg-[#e3e4f8] text-[#191e73]";
  }
}
