/**
 * Zod schemas for the smaller admission forms. Shared by the React Hook Form
 * components and their server actions. Safe to import anywhere.
 */
import { z } from "zod";

const ID_PATTERN = /^[1-9]\d*$/;
export const MAX_REMARKS = 1000;

const optionalId = (message: string) => z.string().trim().refine((v) => !v || ID_PATTERN.test(v), message);

const remarks = z.string().trim().max(MAX_REMARKS, `Remarks must not exceed ${MAX_REMARKS} characters.`);

/** Quota page: campus/program blank = "All". */
export const quotaFormSchema = z.object({
  branch_id: optionalId("Select a valid campus."),
  program_id: optionalId("Select a valid program."),
  quota_slots: z
    .string()
    .trim()
    .min(1, "Enter the number of slots.")
    .regex(/^\d+$/, "Slots must be a whole number.")
    .refine((v) => Number(v) <= 100_000, "Slots must not exceed 100,000."),
});
export type QuotaFormValues = z.input<typeof quotaFormSchema>;

/** "Update admission stage" form on the applicant profile. */
export const stageUpdateSchema = z.object({
  stage_id: z.string().regex(ID_PATTERN, "Please select an admission stage."),
  remarks,
});
export type StageUpdateValues = z.input<typeof stageUpdateSchema>;

/** Enrollment decision remarks (optional when enrolling). */
export const enrollmentDecisionSchema = z.object({ remarks });
export type EnrollmentDecisionValues = z.input<typeof enrollmentDecisionSchema>;

/** Marking "Not Enrolled" requires a reason. */
export const notEnrolledSchema = z.object({
  remarks: remarks.min(1, "Please enter the reason for not enrolling."),
});
