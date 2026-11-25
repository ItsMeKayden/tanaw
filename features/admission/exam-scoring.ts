/**
 * Exam scoring rules. No imports, so the Exam Scores grid (client) and its
 * server action compute totals and pass/fail the same way.
 */
import type { PassingRule } from "@/features/admission/exam";

/**
 * Today's date in the Philippines as "YYYY-MM-DD". Use this, not
 * toISOString(), which gives the UTC date (yesterday until 8 AM in Manila).
 */
export function manilaTodayIso(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** tbl_exam_session_applicant.attendance values (null = not marked yet). */
export const ATTENDANCE = { PRESENT: "PRESENT", ABSENT: "ABSENT" } as const;

/** Percentage of max, rounded to 2 decimals (0 when max is 0). */
export function scorePercent(total: number, max: number) {
  return max > 0 ? Math.round((total / max) * 10_000) / 100 : 0;
}

export function isPassing(total: number, max: number, rule: PassingRule) {
  return rule.byPoints ? total >= rule.value : scorePercent(total, max) >= rule.value;
}

export function formatPassingRule(rule: PassingRule | null) {
  if (!rule) return "not set";
  return rule.byPoints ? `${rule.value} pts` : `${rule.value}%`;
}
