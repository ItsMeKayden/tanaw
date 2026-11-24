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
  error: string | null;
  warning: string | null;
};

export type ScanSubject = { competency_id: number; short: string; max: number };
