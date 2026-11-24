"use server";

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import ExcelJS from "exceljs";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { getCycleExam } from "@/features/admission/exam";
import {
  bulkQuestionRowsSchema,
  examQuestionSchema,
  examSchema,
  type BulkQuestionRow,
  type ExamQuestionValues,
  type ExamValues,
  type ParsedAnswerRow,
} from "@/features/admission/schemas";
import { EXAM_QUESTIONS_PATH } from "@/features/admission/access";

type ActionResult = { success: true; message: string } | { error: string };
type PreviewResult = { rows: ParsedAnswerRow[] } | { error: string };

function validId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  revalidatePath(EXAM_QUESTIONS_PATH);
}

function failure(label: string, error: unknown): ActionResult {
  console.error(`${label} error:`, error);
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

function examFields(data: ExamValues) {
  return {
    exam_name: data.exam_name,
    exam_date: data.exam_date ? new Date(`${data.exam_date}T00:00:00Z`) : null,
    total_items: data.total_items ? Number(data.total_items) : null,
    max_score: data.max_score ? Number(data.max_score) : null,
  };
}

/** Creates the one exam for a school year. Errors if the year already has one. */
export async function createExam(cycleIdInput: number, input: ExamValues): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await prisma.$transaction(async (tx) => {
      const cycle = await tx.tbl_admission_cycle.findUnique({
        where: { cycle_id: cycleId },
        select: { cycle_id: true },
      });
      if (!cycle) throw new Error("Admission cycle not found.");

      const existing = await tx.tbl_exam.findFirst({
        where: { cycle_id: cycleId },
        select: { exam_id: true },
      });
      if (existing) throw new Error("This school year already has an exam.");

      await tx.tbl_exam.create({ data: { cycle_id: cycleId, ...examFields(parsed.data) } });
    });

    revalidate();
    return { success: true, message: "Exam created." };
  } catch (error) {
    return failure("Create exam", error);
  }
}

/** Updates an exam's name, date, and declared items/score. */
export async function updateExam(examIdInput: number, input: ExamValues): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const examId = validId(examIdInput);
  if (!examId) return { error: "Invalid exam." };

  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const updated = await prisma.tbl_exam.updateMany({
      where: { exam_id: examId },
      data: examFields(parsed.data),
    });
    if (updated.count === 0) return { error: "Exam not found." };

    revalidate();
    return { success: true, message: "Exam updated." };
  } catch (error) {
    return failure("Update exam", error);
  }
}

export async function createQuestion(cycleIdInput: number, input: ExamQuestionValues): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const parsed = examQuestionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const questionNo = Number(data.question_no);
  const competencyId = data.competency_id ? validId(data.competency_id) : null;

  try {
    await prisma.$transaction(async (tx) => {
      const exam = await getCycleExam(cycleId, tx);
      if (!exam) throw new Error("Create the exam for this school year first.");

      const duplicate = await tx.tbl_exam_question.findFirst({
        where: { exam_id: exam.exam_id, question_no: questionNo },
        select: { question_id: true },
      });
      if (duplicate) throw new Error(`Question #${questionNo} already exists in this exam.`);

      await tx.tbl_exam_question.create({
        data: {
          exam_id: exam.exam_id,
          question_no: questionNo,
          correct_answer: data.correct_answer,
          points: Number(data.points),
          competency_id: competencyId,
        },
      });
    });

    revalidate();
    return { success: true, message: `Question #${questionNo} added.` };
  } catch (error) {
    return failure("Create question", error);
  }
}

export async function updateQuestion(questionIdInput: number, input: ExamQuestionValues): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const questionId = validId(questionIdInput);
  if (!questionId) return { error: "Invalid question." };

  const parsed = examQuestionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const questionNo = Number(data.question_no);
  const competencyId = data.competency_id ? validId(data.competency_id) : null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.tbl_exam_question.findUnique({
        where: { question_id: questionId },
        select: { exam_id: true },
      });
      if (!existing) throw new Error("Question not found.");

      const duplicate = await tx.tbl_exam_question.findFirst({
        where: { exam_id: existing.exam_id, question_no: questionNo, question_id: { not: questionId } },
        select: { question_id: true },
      });
      if (duplicate) throw new Error(`Question #${questionNo} already exists in this exam.`);

      await tx.tbl_exam_question.update({
        where: { question_id: questionId },
        data: {
          question_no: questionNo,
          correct_answer: data.correct_answer,
          points: Number(data.points),
          competency_id: competencyId,
        },
      });
    });

    revalidate();
    return { success: true, message: `Question #${questionNo} updated.` };
  } catch (error) {
    return failure("Update question", error);
  }
}

export async function deleteQuestion(questionIdInput: number): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const questionId = validId(questionIdInput);
  if (!questionId) return { error: "Invalid question." };

  try {
    const deleted = await prisma.tbl_exam_question.deleteMany({ where: { question_id: questionId } });
    if (deleted.count === 0) return { error: "Question not found." };
    revalidate();
    return { success: true, message: "Question deleted." };
  } catch (error) {
    return failure("Delete question", error);
  }
}

/**
 * Bulk-creates questions from a space/newline-separated answer key string.
 * Each token becomes the correct answer for the next question number, starting
 * after the highest existing question_no (or from 1 if the exam has no questions).
 * Default: 1 point each, no competency — user edits the rows afterwards.
 */
export async function bulkCreateQuestions(cycleIdInput: number, answerKey: string): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const tokens = answerKey
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return { error: "No answers found. Enter at least one answer." };
  if (tokens.length > 500) return { error: "Bulk import is limited to 500 questions at a time." };
  if (tokens.some((t) => t.length > 255)) return { error: "Each answer must not exceed 255 characters." };

  try {
    const added = await prisma.$transaction(async (tx) => {
      const exam = await getCycleExam(cycleId, tx);
      if (!exam) throw new Error("Create the exam for this school year first.");

      const max = await tx.tbl_exam_question.aggregate({
        where: { exam_id: exam.exam_id },
        _max: { question_no: true },
      });
      const startNo = (max._max.question_no ?? 0) + 1;

      await tx.tbl_exam_question.createMany({
        data: tokens.map((answer, i) => ({
          exam_id: exam.exam_id,
          question_no: startNo + i,
          correct_answer: answer,
          points: 1,
          competency_id: null,
        })),
        skipDuplicates: true,
      });

      return tokens.length;
    });

    revalidate();
    return { success: true, message: `${added} question${added === 1 ? "" : "s"} imported.` };
  } catch (error) {
    return failure("Bulk import", error);
  }
}

// ─── File-based import (CSV / Excel) ──────────────────────────────────────────

// Header names we accept for each column (normalized to lowercase + trimmed).
const COLUMN_SYNONYMS = {
  question_no: ["question_no", "question no", "question", "q", "no", "number", "item", "item no", "#"],
  correct_answer: ["correct_answer", "correct answer", "answer", "key", "correct", "ans"],
  points: ["points", "point", "pts", "score", "mark", "marks"],
  competency: ["competency", "competency_name", "subject", "area", "domain"],
} as const;

function pickColumn(headers: string[], synonyms: readonly string[]): string | null {
  return synonyms.find((s) => headers.includes(s)) ?? null;
}

/** Turns normalized records into preview rows, flagging per-row issues. */
function buildAnswerRows(
  records: Record<string, string>[],
  headers: string[],
  competencies: { competency_id: number; competency_name: string }[],
): ParsedAnswerRow[] {
  const answerCol = pickColumn(headers, COLUMN_SYNONYMS.correct_answer);
  if (!answerCol) {
    throw new Error(
      'Could not find an answer column. Add a header row with a "correct_answer" column.',
    );
  }
  const noCol = pickColumn(headers, COLUMN_SYNONYMS.question_no);
  const pointsCol = pickColumn(headers, COLUMN_SYNONYMS.points);
  const compCol = pickColumn(headers, COLUMN_SYNONYMS.competency);

  const compByName = new Map(competencies.map((c) => [c.competency_name.trim().toLowerCase(), c.competency_id]));

  const rows: ParsedAnswerRow[] = [];
  records.forEach((rec, i) => {
    const rowNumber = i + 2; // data starts on sheet/file row 2 (row 1 is the header).
    const answer = (rec[answerCol] ?? "").trim();
    const noRaw = noCol ? (rec[noCol] ?? "").trim() : "";
    const pointsRaw = pointsCol ? (rec[pointsCol] ?? "").trim() : "";
    const compRaw = compCol ? (rec[compCol] ?? "").trim() : "";

    // Skip fully blank lines.
    if (!answer && !noRaw && !pointsRaw && !compRaw) return;

    let error: string | null = null;
    let warning: string | null = null;

    if (!answer) error = "Missing answer.";
    else if (answer.length > 255) error = "Answer exceeds 255 characters.";

    let question_no: number | null = null;
    if (noRaw) {
      const n = Number(noRaw);
      if (!Number.isInteger(n) || n < 1 || n > 10_000) error ??= `Invalid question number "${noRaw}".`;
      else question_no = n;
    }

    let points = 1;
    if (pointsRaw) {
      const p = Number(pointsRaw);
      if (!Number.isInteger(p) || p < 1 || p > 1000) error ??= `Invalid points "${pointsRaw}".`;
      else points = p;
    }

    let competency_id: number | null = null;
    if (compRaw) {
      const matched = compByName.get(compRaw.toLowerCase());
      if (matched) competency_id = matched;
      else warning = `Subject "${compRaw}" not recognized — left unassigned.`;
    }

    rows.push({
      rowNumber,
      question_no,
      correct_answer: answer,
      points,
      competency_id,
      competency_label: competency_id ? compRaw : compRaw && !error ? `${compRaw} (unmatched)` : compRaw,
      error,
      warning,
    });
  });

  return rows;
}

/** Parses an uploaded CSV/XLSX (base64) into preview rows. Does not write anything. */
export async function previewAnswerKeyFile(filename: string, base64: string): Promise<PreviewResult> {
  await requirePermission("admission", "write");

  if (!base64) return { error: "No file provided." };
  if (base64.length > 4_000_000) return { error: "File is too large (about 3 MB max)." };

  const buffer = Buffer.from(base64, "base64");
  const lower = filename.toLowerCase();

  try {
    let records: Record<string, string>[];
    let headers: string[];

    if (lower.endsWith(".csv")) {
      const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf8"), {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
      });
      records = parsed.data;
      headers = (parsed.meta.fields ?? []).map((f) => f.trim().toLowerCase());
    } else if (lower.endsWith(".xlsx")) {
      const workbook = new ExcelJS.Workbook();
      // @types/node types Buffer.from as a generic Buffer; ExcelJS wants its own Buffer type.
      await workbook.xlsx.load(buffer as never);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { error: "The workbook has no sheets." };

      headers = [];
      sheet.getRow(1).eachCell((cell, col) => {
        headers[col] = String(cell.text ?? "").trim().toLowerCase();
      });

      records = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rec: Record<string, string> = {};
        row.eachCell((cell, col) => {
          const key = headers[col];
          if (key) rec[key] = String(cell.text ?? "").trim();
        });
        records.push(rec);
      });
      headers = headers.filter(Boolean);
    } else {
      return { error: "Unsupported file type. Upload a .csv or .xlsx file." };
    }

    const competencies = await prisma.tbl_competency.findMany({
      select: { competency_id: true, competency_name: true },
    });

    const rows = buildAnswerRows(records, headers, competencies);
    if (rows.length === 0) return { error: "No data rows found in the file." };
    if (rows.length > 500) return { error: "Import is limited to 500 questions at a time." };

    return { rows };
  } catch (error) {
    console.error("Preview answer key error:", error);
    return { error: error instanceof Error ? error.message : "Could not read the file." };
  }
}

/** Imports validated rows produced by the file-import preview. */
export async function bulkCreateQuestionsFromRows(
  cycleIdInput: number,
  rowsInput: BulkQuestionRow[],
): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const parsed = bulkQuestionRowsSchema.safeParse(rowsInput);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rows = parsed.data;

  try {
    const added = await prisma.$transaction(async (tx) => {
      const exam = await getCycleExam(cycleId, tx);
      if (!exam) throw new Error("Create the exam for this school year first.");

      const existing = await tx.tbl_exam_question.findMany({
        where: { exam_id: exam.exam_id },
        select: { question_no: true },
      });
      const existingNos = new Set(existing.map((q) => q.question_no));
      const maxNo = existing.reduce((m, q) => Math.max(m, q.question_no), 0);

      // Honor explicit numbers only when every row has one; otherwise append in order.
      const hasExplicit = rows.every((r) => r.question_no !== null);
      const seen = new Set<number>();
      const numbered = rows.map((r, i) => {
        let no: number;
        if (hasExplicit) {
          no = r.question_no as number;
          if (seen.has(no)) throw new Error(`Duplicate question number ${no} in the file.`);
          if (existingNos.has(no)) throw new Error(`Question #${no} already exists in this exam.`);
          seen.add(no);
        } else {
          no = maxNo + 1 + i;
        }
        return {
          exam_id: exam.exam_id,
          question_no: no,
          correct_answer: r.correct_answer,
          points: r.points,
          competency_id: r.competency_id,
        };
      });

      const compIds = [...new Set(numbered.map((r) => r.competency_id).filter((x): x is number => x !== null))];
      if (compIds.length > 0) {
        const found = await tx.tbl_competency.count({ where: { competency_id: { in: compIds } } });
        if (found !== compIds.length) throw new Error("One or more subjects no longer exist. Re-check the file.");
      }

      await tx.tbl_exam_question.createMany({ data: numbered });
      return numbered.length;
    });

    revalidate();
    return { success: true, message: `${added} question${added === 1 ? "" : "s"} imported.` };
  } catch (error) {
    return failure("Bulk import", error);
  }
}
