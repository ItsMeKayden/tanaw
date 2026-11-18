/**
 * Course recommendation settings. No imports — safe for client, server, and
 * seed code.
 *
 * Model (weighted score):
 *   competency score  = points earned / points possible on that competency's
 *                       exam questions (tbl_question_response)
 *   course match (%)  = Σ (competency score × course weight) / 100
 *                       using tbl_program_competency.weight (each course's
 *                       weights add up to 100)
 */

/** Competencies measured by the admission exam (tbl_competency). */
export const COMPETENCIES = [
  { name: "Mathematics", short: "Math", subject_area: "Mathematics", description: "Numerical computation, algebra, and problem solving." },
  { name: "English", short: "English", subject_area: "Language", description: "Reading comprehension, grammar, and vocabulary." },
  { name: "Science", short: "Science", subject_area: "Science", description: "General science concepts and scientific reasoning." },
  { name: "Logical Reasoning", short: "Reasoning", subject_area: "Aptitude", description: "Abstract, verbal, and pattern-based reasoning." },
  { name: "Filipino", short: "Filipino", subject_area: "Language", description: "Pag-unawa sa binasa, gramatika, at talasalitaan." },
] as const;

export type CompetencyName = (typeof COMPETENCIES)[number]["name"];

/**
 * Default competency weights per course (program_code), in COMPETENCIES
 * order: Math, English, Science, Reasoning, Filipino. Each row adds to 100.
 * Used by the seeder and "Reset to default".
 */
export const DEFAULT_PROGRAM_WEIGHTS: Record<string, [number, number, number, number, number]> = {
  BSA: [35, 20, 5, 30, 10],
  BSEntrep: [20, 30, 5, 30, 15],
  BECEd: [10, 30, 10, 20, 30],
  BSECE: [35, 10, 30, 20, 5],
  BSIE: [30, 15, 20, 30, 5],
  BSIT: [30, 15, 10, 40, 5],
  BSMA: [30, 25, 5, 30, 10],
};

/** Weights used for a course that has no default above. */
export const FALLBACK_WEIGHTS: [number, number, number, number, number] = [20, 20, 20, 20, 20];

/**
 * Default minimum match (tbl_program.min_match) for a course to count as
 * "Compatible"; each course's value is edited on Mapping Settings. The
 * course's minimum is also the required score per weighted competency in the
 * score breakdown. Also the Moderate-fit threshold for fitLabel/fitClass.
 */
export const MIN_MATCH = 70;

/** Match at or above this is a "Strong fit". */
export const STRONG_FIT = 85;

export function shortCompetencyName(name: string) {
  return COMPETENCIES.find((c) => c.name === name)?.short ?? name;
}

export function fitLabel(match: number | null) {
  if (match === null) return "Not scored";
  if (match >= STRONG_FIT) return "Strong fit";
  if (match >= MIN_MATCH) return "Moderate fit";
  return "Low fit";
}

export function fitClass(match: number | null) {
  if (match === null) return "bg-neutral-200 text-neutral-700";
  if (match >= STRONG_FIT) return "bg-green-600 text-white";
  if (match >= MIN_MATCH) return "bg-[#e3e4f8] text-[#191e73]";
  return "bg-amber-100 text-amber-900";
}

/** Weighted match (0–100) from competency scores and course weights. */
export function computeMatch(
  scores: ReadonlyMap<number, number>,
  weights: readonly { competency_id: number; weight: number }[],
) {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) return null;

  const weighted = weights.reduce(
    (sum, w) => sum + (scores.get(w.competency_id) ?? 0) * w.weight,
    0,
  );

  return Math.round((weighted / totalWeight) * 100) / 100;
}
