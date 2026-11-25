/**
 * Pure grading helpers shared by the scanned-sheet import (and later the image
 * OMR pipeline). No I/O — takes an answer key plus a map of marked letters and
 * returns earned points per competency. Only A–D marks count; anything else is
 * treated as unanswered.
 */

export type AnswerKeyItem = {
  question_no: number;
  correct_answer: string;
  points: number;
  competency_id: number | null;
};

export type GradeResult = {
  /** competency_id -> earned points (only competencies that earned > 0 appear). */
  byCompetency: Map<number, number>;
  total: number;
  answered: number;
  correct: number;
};

/** Returns an uppercase single letter A–D, or "" when the mark is blank/invalid. */
export function normalizeAnswer(raw: string): string {
  const s = (raw ?? "").trim().toUpperCase();
  return /^[A-D]$/.test(s) ? s : "";
}

export function gradeMarked(key: AnswerKeyItem[], marked: Map<number, string>): GradeResult {
  const byCompetency = new Map<number, number>();
  let total = 0;
  let answered = 0;
  let correct = 0;

  for (const item of key) {
    const mark = normalizeAnswer(marked.get(item.question_no) ?? "");
    if (mark) answered++;
    if (mark && mark === normalizeAnswer(item.correct_answer)) {
      correct++;
      total += item.points;
      if (item.competency_id !== null) {
        byCompetency.set(item.competency_id, (byCompetency.get(item.competency_id) ?? 0) + item.points);
      }
    }
  }

  return { byCompetency, total, answered, correct };
}

/** One applicant row in the scanned-result import preview. */
export type ScannedPreviewRow = {
  rowNumber: number;
  application_no: string;
  applicant_name: string | null;
  application_id: number | null;
  total: number;
  max: number;
  percentage: number | null;
  answered: number;
  questionCount: number;
  /** Aligned to the official subject list; safe to pass to saveExamScores. */
  scores: { competency_id: number; score: number }[];
  /** Exam set the applicant's session takes ("A" / "B"); graded with that key. */
  set: string;
  /** Marked letter per question number (blank marks left out), saved as answers. */
  answers: Record<number, string>;
  error: string | null;
  warning: string | null;
};

export type ScanSubject = { competency_id: number; short: string; max: number };

const SHUFFLE_LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Reshuffles a question's choices so the correct one lands on a different
 * letter than before (others random). Returns null when it has no choices.
 */
export function reshuffledChoices(q: {
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_answer: string;
}) {
  const choices = [q.choice_a, q.choice_b, q.choice_c, q.choice_d];
  const correctIndex = SHUFFLE_LETTERS.indexOf(q.correct_answer.trim().toUpperCase() as (typeof SHUFFLE_LETTERS)[number]);
  if (choices.some((c) => !c) || correctIndex === -1) return null;

  const others = SHUFFLE_LETTERS.map((_, i) => i).filter((i) => i !== correctIndex);
  const newCorrect = others[Math.floor(Math.random() * others.length)];
  const wrong = choices.filter((_, i) => i !== correctIndex) as string[];
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  const next: string[] = [];
  let w = 0;
  for (let i = 0; i < SHUFFLE_LETTERS.length; i++) next.push(i === newCorrect ? (choices[correctIndex] as string) : wrong[w++]);
  return {
    choice_a: next[0],
    choice_b: next[1],
    choice_c: next[2],
    choice_d: next[3],
    correct_answer: SHUFFLE_LETTERS[newCorrect],
  };
}
