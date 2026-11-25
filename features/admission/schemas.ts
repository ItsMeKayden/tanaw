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

/** Required "HH:MM" time; an empty value fails the same check, so there's one message. */
const requiredTime = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter the ${label}, e.g. 08:00.`);

/** "New session" form on the Exam Schedule page. Start and end time are required. */
export const examSessionSchema = z
  .object({
    session_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the exam date.")
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Choose a valid date."),
    start_time: requiredTime("start time"),
    end_time: requiredTime("end time"),
    venue: z.string().trim().min(1, "Enter the venue.").max(150, "Venue must not exceed 150 characters."),
    room: z.string().trim().max(50, "Room must not exceed 50 characters."),
    exam_set: z.enum(["A", "B"], "Choose the exam set."),
    capacity: z
      .string()
      .trim()
      .regex(/^\d+$/, "Capacity must be a whole number.")
      .refine((v) => Number(v) >= 1 && Number(v) <= 1000, "Capacity must be between 1 and 1,000."),
  })
  // "HH:MM" strings compare correctly as text.
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, {
    message: "End time must be after the start time.",
    path: ["end_time"],
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

const optionalCount = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[1-9]\d*$/.test(v), "Must be a positive whole number.")
  .refine((v) => v === "" || Number(v) <= 100_000, "Must not exceed 100,000.");

/** "Create / edit exam" form on the Exam Questions page. */
export const examSchema = z.object({
  exam_name: z.string().trim().min(1, "Enter the exam name.").max(150, "Name must not exceed 150 characters."),
  exam_date: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))),
      "Choose a valid date.",
    ),
  total_items: optionalCount,
  max_score: optionalCount,
});
export type ExamValues = z.input<typeof examSchema>;

/** One structured row for a file-based answer-key import (post-parse). */
const bulkChoice = z.string().trim().min(1).max(500).nullable();

export const bulkQuestionRowSchema = z
  .object({
    question_no: z.number().int().positive().max(10_000).nullable(),
    question_text: z.string().trim().min(1).max(2000).nullable(),
    choice_a: bulkChoice,
    choice_b: bulkChoice,
    choice_c: bulkChoice,
    choice_d: bulkChoice,
    correct_answer: z.string().trim().min(1, "Enter the correct answer.").max(255),
    points: z.number().int().positive().max(1000),
    competency_id: z.number().int().positive().nullable(),
  })
  .refine(
    (r) => {
      const choices = [r.choice_a, r.choice_b, r.choice_c, r.choice_d];
      if (choices.every((c) => c === null)) return true;
      return choices.every((c) => c !== null) && /^[A-D]$/.test(r.correct_answer);
    },
    { message: "A question with choices needs all four (A–D) and an answer of A, B, C or D." },
  );
export const bulkQuestionRowsSchema = z
  .array(bulkQuestionRowSchema)
  .min(1, "No rows to import.")
  .max(500, "Import is limited to 500 questions at a time.");
export type BulkQuestionRow = z.infer<typeof bulkQuestionRowSchema>;

/** A parsed row shown in the file-import preview (carries per-row issues). */
export type ParsedAnswerRow = {
  rowNumber: number;
  question_no: number | null;
  question_text: string | null;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_answer: string;
  points: number;
  competency_id: number | null;
  competency_label: string;
  error: string | null;
  warning: string | null;
};

/** Single row on the Exam Questions page (add or edit). */
const choiceField = z.string().trim().max(500, "A choice must not exceed 500 characters.");
export const CHOICE_KEYS = ["choice_a", "choice_b", "choice_c", "choice_d"] as const;

/**
 * Add / edit question. Text and choices are optional (answer-key-only
 * questions); when any choice is filled, all four are required and the
 * correct answer must be the letter A–D of one of them.
 */
export const examQuestionSchema = z
  .object({
    question_no: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "Question number must be a positive whole number.")
      .refine((v) => Number(v) <= 10_000, "Question number must not exceed 10,000."),
    question_text: z.string().trim().max(2000, "The question must not exceed 2,000 characters."),
    choice_a: choiceField,
    choice_b: choiceField,
    choice_c: choiceField,
    choice_d: choiceField,
    correct_answer: z.string().trim().min(1, "Enter the correct answer.").max(255, "Answer must not exceed 255 characters."),
    points: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "Points must be a positive whole number.")
      .refine((v) => Number(v) <= 1000, "Points must not exceed 1,000."),
    competency_id: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const filled = CHOICE_KEYS.filter((k) => v[k] !== "");
    if (filled.length === 0) return;
    for (const key of CHOICE_KEYS) {
      if (v[key] === "") ctx.addIssue({ code: "custom", path: [key], message: "Fill in all four choices, or leave them all empty." });
    }
    if (!/^[A-D]$/i.test(v.correct_answer)) {
      ctx.addIssue({ code: "custom", path: ["correct_answer"], message: "Choose the correct letter (A–D)." });
    }
  });
export type ExamQuestionValues = z.input<typeof examQuestionSchema>;
