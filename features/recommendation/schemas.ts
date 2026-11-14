/**
 * Zod schemas for the course-to-competency mapping, shared by the React Hook
 * Form editor and the saveMapping server action. Safe to import anywhere.
 */
import { z } from "zod";

const roundTo2 = (n: number) => Math.round(n * 100) / 100;
const hasAtMost2Decimals = (n: number) => Math.abs(roundTo2(n) - n) < 1e-9;

/** One weight as typed in the grid (string input). */
export const weightInputSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => Number.isFinite(Number(v)), "Enter a number")
  .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Must be 0–100")
  .refine((v) => hasAtMost2Decimals(Number(v)), "Max 2 decimals");

/**
 * Editor form: rows["p<program_id>"]["c<competency_id>"] = "30".
 * (Prefixed keys so React Hook Form doesn't treat ids as array indexes.)
 * Each row must add up to exactly 100.
 */
export const mappingFormSchema = z
  .object({ rows: z.record(z.string(), z.record(z.string(), weightInputSchema)) })
  .superRefine((value, ctx) => {
    for (const [rowKey, weights] of Object.entries(value.rows)) {
      const total = roundTo2(Object.values(weights).reduce((sum, w) => sum + (Number(w) || 0), 0));
      if (total !== 100) {
        ctx.addIssue({ code: "custom", path: ["rows", rowKey, "total"], message: `Adds up to ${total}%` });
      }
    }
  });
export type MappingFormValues = z.input<typeof mappingFormSchema>;

/** Server input for saveMapping. */
export const mappingSaveSchema = z
  .array(
    z.object({
      program_id: z.number().int().positive(),
      weights: z
        .array(
          z.object({
            competency_id: z.number().int().positive(),
            weight: z
              .number()
              .min(0, "Each weight must be between 0 and 100.")
              .max(100, "Each weight must be between 0 and 100.")
              .refine(hasAtMost2Decimals, "Use at most two decimal places."),
          }),
        )
        .min(1),
    }),
  )
  .min(1, "Nothing to save.");
export type MappingSaveInput = z.input<typeof mappingSaveSchema>;

export function rowTotal(weights: { weight: number }[]) {
  return roundTo2(weights.reduce((sum, w) => sum + w.weight, 0));
}
