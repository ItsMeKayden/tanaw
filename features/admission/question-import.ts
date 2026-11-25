// Parsing for the Exam Questions bulk import (CSV / Excel → preview rows).
// Server-side only (reads files with Papa Parse / ExcelJS); no database access.
import Papa from "papaparse";
import ExcelJS from "exceljs";

import type { ParsedAnswerRow } from "@/features/admission/schemas";
import { shortCompetencyName } from "@/features/recommendation/config";

const COLUMN_SYNONYMS = {
  question_no: ["question_no", "question no", "question number", "q#", "q", "no", "no.", "number", "item", "item no", "#"],
  question_text: ["question_text", "question text", "question", "text", "stem", "item text"],
  choice_a: ["choice_a", "choice a", "option_a", "option a", "a"],
  choice_b: ["choice_b", "choice b", "option_b", "option b", "b"],
  choice_c: ["choice_c", "choice c", "option_c", "option c", "c"],
  choice_d: ["choice_d", "choice d", "option_d", "option d", "d"],
  correct_answer: ["correct_answer", "correct answer", "answer", "key", "correct", "ans"],
  points: ["points", "point", "pts", "score", "mark", "marks"],
  competency: ["competency", "competency_name", "subject", "area", "domain"],
} as const;

function pickColumn(headers: string[], synonyms: readonly string[]): string | null {
  return synonyms.find((s) => headers.includes(s)) ?? null;
}

/** Whole number in [min, max] from a cell: { value } when valid, { invalid } when not, {} when blank. */
function wholeNumber(raw: string, min: number, max: number): { value?: number; invalid?: boolean } {
  if (!raw) return {};
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { invalid: true };
}

/** Problems with a row's question text, choices and answer. */
function contentIssues(text: string, choices: string[], answer: string, rawAnswer: string) {
  let error: string | null = null;
  let warning: string | null = null;
  if (!answer) error = "Missing answer.";
  else if (answer.length > 255) error = "Answer exceeds 255 characters.";
  if (text.length > 2000) error ??= "Question text exceeds 2,000 characters.";
  if (choices.some((c) => c !== "")) {
    const missing = choices.flatMap((c, index) => (c === "" ? ["ABCD"[index]] : []));
    if (missing.length > 0) error ??= `Missing choice ${missing.join(", ")}. Fill in all four or none.`;
    else if (choices.some((c) => c.length > 500)) error ??= "A choice exceeds 500 characters.";
    if (answer && !/^[A-D]$/.test(answer)) error ??= `Answer "${rawAnswer}" must be A, B, C or D.`;
    if (!text) warning = "Has choices but no question text.";
  }
  return { error, warning };
}

type ImportColumns = {
  answer: string;
  no: string | null;
  text: string | null;
  choices: (string | null)[];
  points: string | null;
  competency: string | null;
};

/** One file row → preview row (null for a blank line). */
function parseRecord(
  rec: Record<string, string>,
  rowNumber: number,
  cols: ImportColumns,
  compByName: Map<string, number>,
): ParsedAnswerRow | null {
  const cell = (col: string | null) => (col ? (rec[col] ?? "").trim() : "");
  const noRaw = cell(cols.no);
  const text = cell(cols.text);
  const choices = cols.choices.map(cell);
  const hasChoices = choices.some((c) => c !== "");
  const rawAnswer = cell(cols.answer);
  const answer = hasChoices ? rawAnswer.toUpperCase() : rawAnswer;
  const pointsRaw = cell(cols.points);
  const compRaw = cell(cols.competency);

  if (!answer && !noRaw && !pointsRaw && !compRaw && !text && !hasChoices) return null;

  let { error, warning } = contentIssues(text, choices, answer, rawAnswer);

  const no = wholeNumber(noRaw, 1, 10_000);
  if (no.invalid) error ??= `Invalid question number "${noRaw}".`;
  const points = wholeNumber(pointsRaw, 1, 1000);
  if (points.invalid) error ??= `Invalid points "${pointsRaw}".`;

  const competency_id = compRaw ? (compByName.get(compRaw.toLowerCase()) ?? null) : null;
  if (compRaw && competency_id === null) warning ??= `Subject "${compRaw}" not recognized — left unassigned.`;

  return {
    rowNumber,
    question_no: no.value ?? null,
    question_text: text || null,
    choice_a: hasChoices ? choices[0] || null : null,
    choice_b: hasChoices ? choices[1] || null : null,
    choice_c: hasChoices ? choices[2] || null : null,
    choice_d: hasChoices ? choices[3] || null : null,
    correct_answer: answer,
    points: points.value ?? 1,
    competency_id,
    competency_label: compRaw && competency_id === null ? `${compRaw} (unmatched)` : compRaw,
    error,
    warning,
  };
}

/** Turns normalized records into preview rows, flagging per-row issues. */
export function buildAnswerRows(
  records: Record<string, string>[],
  headers: string[],
  competencies: { competency_id: number; competency_name: string }[],
): ParsedAnswerRow[] {
  const answer = pickColumn(headers, COLUMN_SYNONYMS.correct_answer);
  if (!answer) {
    throw new Error('Could not find an answer column. Add a header row with a "correct_answer" column.');
  }
  const cols: ImportColumns = {
    answer,
    no: pickColumn(headers, COLUMN_SYNONYMS.question_no),
    text: pickColumn(headers, COLUMN_SYNONYMS.question_text),
    choices: (["choice_a", "choice_b", "choice_c", "choice_d"] as const).map((key) => pickColumn(headers, COLUMN_SYNONYMS[key])),
    points: pickColumn(headers, COLUMN_SYNONYMS.points),
    competency: pickColumn(headers, COLUMN_SYNONYMS.competency),
  };

  const compByName = new Map(competencies.map((c) => [c.competency_name.trim().toLowerCase(), c.competency_id]));
  // Short names work too ("Math", "Reasoning").
  for (const c of competencies) compByName.set(shortCompetencyName(c.competency_name).toLowerCase(), c.competency_id);

  // Data starts on sheet/file row 2 (row 1 is the header).
  return records.flatMap((rec, i) => parseRecord(rec, i + 2, cols, compByName) ?? []);
}


/** Reads a .csv or .xlsx file into lower-cased headers and records (first sheet, row 1 = header). */
export async function readQuestionFile(filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf8").replace(/^\uFEFF/, ""), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    return { records: parsed.data, headers: (parsed.meta.fields ?? []).map((f) => f.trim().toLowerCase()) };
  }
  if (lower.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    // @types/node types Buffer.from as a generic Buffer; ExcelJS wants its own Buffer type.
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("The workbook has no sheets.");
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => {
      headers[col] = String(cell.text ?? "").trim().toLowerCase();
    });
    const records: Record<string, string>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rec: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers[col];
        if (key) rec[key] = String(cell.text ?? "").trim();
      });
      records.push(rec);
    });
    return { records, headers: headers.filter(Boolean) };
  }
  throw new Error("Unsupported file type. Upload a .csv or .xlsx file.");
}
