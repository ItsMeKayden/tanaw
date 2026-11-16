/**
 * Zod schemas for the smaller admission forms. Shared by the React Hook Form
 * components and their server actions. Safe to import anywhere.
 */
import { z } from "zod";

const ID_PATTERN = /^[1-9]\d*$/;
export const MAX_REMARKS = 1000;

const remarks = z.string().trim().max(MAX_REMARKS, `Remarks must not exceed ${MAX_REMARKS} characters.`);

const slotsField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+$/.test(v), "Slots must be a whole number.")
  .refine((v) => v === "" || Number(v) <= 100_000, "Slots must not exceed 100,000.");

/** Quota page: overall target + per-course slots (blank = no quota). */
export const quotaPlanSchema = z.object({
  overall: slotsField,
  courses: z.array(z.object({ program_id: z.number().int().positive(), slots: slotsField })).max(500),
});
export type QuotaPlanValues = z.input<typeof quotaPlanSchema>;

/** "New session" form on the Exam Schedule page. */
export const examSessionSchema = z.object({
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the exam date.")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Choose a valid date."),
  start_time: z
    .string()
    .trim()
    .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use a valid time, e.g. 08:00."),
  venue: z.string().trim().min(1, "Enter the venue.").max(150, "Venue must not exceed 150 characters."),
  room: z.string().trim().max(50, "Room must not exceed 50 characters."),
  capacity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Capacity must be a whole number.")
    .refine((v) => Number(v) >= 1 && Number(v) <= 1000, "Capacity must be between 1 and 1,000."),
});
export type ExamSessionValues = z.input<typeof examSessionSchema>;

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
