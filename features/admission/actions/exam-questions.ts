"use server";

import { revalidatePath } from "next/cache";



import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { getCycleExam, isExamLocked } from "@/features/admission/exam";
import { BASE_SET, toExamSet, type ExamSet } from "@/features/admission/exam-scoring";
import { reshuffledChoices } from "@/features/admission/exam-grading";
import { buildAnswerRows, readQuestionFile } from "@/features/admission/question-import";

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

const LOCKED_ERROR = "This exam is locked because its exam date has passed. Unlock it for editing first.";

/** Throws when the exam's questions are locked (exam date passed and not unlocked). */
async function assertEditable(db: Prisma.TransactionClient, examId: number) {
  const exam = await db.tbl_exam.findUnique({
    where: { exam_id: examId },
    select: { exam_date: true, edit_unlocked: true },
  });
  if (!exam) throw new Error("Exam not found.");
  if (isExamLocked(exam)) throw new Error(LOCKED_ERROR);
}

/**
 * Unlocks (or re-locks) an exam's questions after its exam date. Changing
 * correct answers or deleting questions then affects existing scores.
 */
export async function setExamEditUnlocked(examIdInput: number, unlocked: boolean): Promise<ActionResult> {
  await requirePermission("admission", "write");
  const examId = validId(examIdInput);
  if (!examId || typeof unlocked !== "boolean") return { error: "Invalid exam." };

  try {
    const updated = await prisma.tbl_exam.updateMany({ where: { exam_id: examId }, data: { edit_unlocked: unlocked } });
    if (updated.count === 0) return { error: "Exam not found." };
    revalidate();
    return {
      success: true,
      message: unlocked ? "Exam unlocked for editing." : "Exam locked again.",
    };
  } catch (error) {
    return failure("Unlock exam", error);
  }
}


/**
 * Copies Set A into Set B with each question's choices reshuffled (new
 * answer key). Questions without choices are copied as they are.
 */
export async function duplicateExamSet(examIdInput: number): Promise<ActionResult> {
  await requirePermission("admission", "write");
  const examId = validId(examIdInput);
  if (!examId) return { error: "Invalid exam." };

  try {
    const { copied, unchanged } = await prisma.$transaction(async (tx) => {
      await assertEditable(tx, examId);
      if (await tx.tbl_exam_question.count({ where: { exam_id: examId, set_label: "B" } })) {
        throw new Error("Set B already exists. Reshuffle or delete it instead.");
      }
      const source = await tx.tbl_exam_question.findMany({
        where: { exam_id: examId, set_label: BASE_SET },
        orderBy: { question_no: "asc" },
      });
      if (source.length === 0) throw new Error("Add questions to Set A first.");

      let kept = 0;
      await tx.tbl_exam_question.createMany({
        data: source.map((q) => {
          const shuffled = reshuffledChoices(q);
          if (!shuffled) kept++;
          return {
            exam_id: examId,
            set_label: "B",
            question_no: q.question_no,
            question_text: q.question_text,
            choice_a: q.choice_a,
            choice_b: q.choice_b,
            choice_c: q.choice_c,
            choice_d: q.choice_d,
            correct_answer: q.correct_answer,
            ...shuffled,
            points: q.points,
            competency_id: q.competency_id,
          };
        }),
      });
      return { copied: source.length, unchanged: kept };
    });

    revalidate();
    const note = unchanged ? ` ${unchanged} answer-key-only question${unchanged === 1 ? " was" : "s were"} copied without reshuffling.` : "";
    return { success: true, message: `Set B created from ${copied} questions with a reshuffled answer key.${note}` };
  } catch (error) {
    return failure("Duplicate exam set", error);
  }
}

/** Reshuffles Set B's choices again (only before anyone has answers recorded for it). */
export async function reshuffleExamSet(examIdInput: number): Promise<ActionResult> {
  await requirePermission("admission", "write");
  const examId = validId(examIdInput);
  if (!examId) return { error: "Invalid exam." };

  try {
    const count = await prisma.$transaction(async (tx) => {
      await assertEditable(tx, examId);
      const answered = await tx.tbl_question_response.count({
        where: { tbl_exam_question: { exam_id: examId, set_label: "B" } },
      });
      if (answered > 0) throw new Error("Set B already has recorded answers, so its answer key can't be reshuffled.");

      const questions = await tx.tbl_exam_question.findMany({ where: { exam_id: examId, set_label: "B" } });
      if (questions.length === 0) throw new Error("There is no Set B yet.");
      let changed = 0;
      for (const q of questions) {
        const shuffled = reshuffledChoices(q);
        if (!shuffled) continue;
        await tx.tbl_exam_question.update({ where: { question_id: q.question_id }, data: shuffled });
        changed++;
      }
      return changed;
    });
    revalidate();
    return { success: true, message: `Set B reshuffled (${count} question${count === 1 ? "" : "s"}).` };
  } catch (error) {
    return failure("Reshuffle exam set", error);
  }
}

/** Deletes Set B when no session uses it and nobody has answers recorded for it. */
export async function deleteExamSet(examIdInput: number): Promise<ActionResult> {
  await requirePermission("admission", "write");
  const examId = validId(examIdInput);
  if (!examId) return { error: "Invalid exam." };

  try {
    await prisma.$transaction(async (tx) => {
      await assertEditable(tx, examId);
      const sessions = await tx.tbl_exam_session.count({ where: { exam_id: examId, exam_set: "B", archived_at: null } });
      if (sessions > 0) {
        throw new Error(`${sessions} exam session${sessions === 1 ? " uses" : "s use"} Set B. Switch them to Set A first.`);
      }
      const answered = await tx.tbl_question_response.count({
        where: { tbl_exam_question: { exam_id: examId, set_label: "B" } },
      });
      if (answered > 0) throw new Error("Set B has recorded answers, so it can't be deleted.");
      await tx.tbl_exam_question.deleteMany({ where: { exam_id: examId, set_label: "B" } });
    });
    revalidate();
    return { success: true, message: "Set B deleted." };
  } catch (error) {
    return failure("Delete exam set", error);
  }
}

/** Question text, choices and answer as stored (empty → null; letter answers upper-cased). */
function questionContent(data: {
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_answer: string;
}) {
  const hasChoices = data.choice_a !== "";
  return {
    question_text: data.question_text || null,
    choice_a: data.choice_a || null,
    choice_b: data.choice_b || null,
    choice_c: data.choice_c || null,
    choice_d: data.choice_d || null,
    correct_answer: hasChoices ? data.correct_answer.toUpperCase() : data.correct_answer,
  };
}

export async function createQuestion(
  cycleIdInput: number,
  input: ExamQuestionValues,
  setInput: ExamSet = BASE_SET,
): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };
  const set = toExamSet(setInput);

  const parsed = examQuestionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const questionNo = Number(data.question_no);
  const competencyId = data.competency_id ? validId(data.competency_id) : null;

  try {
    await prisma.$transaction(async (tx) => {
      const exam = await getCycleExam(cycleId, tx);
      if (!exam) throw new Error("Create the exam for this school year first.");
      await assertEditable(tx, exam.exam_id);

      const duplicate = await tx.tbl_exam_question.findFirst({
        where: { exam_id: exam.exam_id, set_label: set, question_no: questionNo },
        select: { question_id: true },
      });
      if (duplicate) throw new Error(`Question #${questionNo} already exists in Set ${set}.`);

      await tx.tbl_exam_question.create({
        data: {
          exam_id: exam.exam_id,
          set_label: set,
          question_no: questionNo,
          ...questionContent(data),
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
        select: { exam_id: true, set_label: true },
      });
      if (!existing?.exam_id) throw new Error("Question not found.");
      await assertEditable(tx, existing.exam_id);

      const duplicate = await tx.tbl_exam_question.findFirst({
        where: {
          exam_id: existing.exam_id,
          set_label: existing.set_label,
          question_no: questionNo,
          question_id: { not: questionId },
        },
        select: { question_id: true },
      });
      if (duplicate) throw new Error(`Question #${questionNo} already exists in Set ${existing.set_label}.`);

      await tx.tbl_exam_question.update({
        where: { question_id: questionId },
        data: {
          question_no: questionNo,
          ...questionContent(data),
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

/**
 * Deletes one or more questions (all-or-nothing). Their recorded answers go
 * with them (database cascade); saved scores are not recalculated.
 */
export async function deleteQuestions(questionIdsInput: number[]): Promise<ActionResult> {
  await requirePermission("admission", "write");

  if (!Array.isArray(questionIdsInput) || questionIdsInput.length === 0) return { error: "No questions selected." };
  if (questionIdsInput.length > 500) return { error: "Delete at most 500 questions at a time." };
  const ids = [...new Set(questionIdsInput.map(validId))];
  if (ids.some((id) => id === null)) return { error: "Invalid question." };

  try {
    const count = await prisma.$transaction(async (tx) => {
      const questions = await tx.tbl_exam_question.findMany({
        where: { question_id: { in: ids as number[] } },
        select: { exam_id: true },
      });
      if (questions.length !== ids.length) throw new Error("Some questions no longer exist. Reload the page.");
      for (const examId of new Set(questions.map((q) => q.exam_id))) {
        if (examId === null) throw new Error("Question not found.");
        await assertEditable(tx, examId);
      }
      const deleted = await tx.tbl_exam_question.deleteMany({ where: { question_id: { in: ids as number[] } } });
      return deleted.count;
    });
    revalidate();
    return { success: true, message: count === 1 ? "Question deleted." : `${count} questions deleted.` };
  } catch (error) {
    return failure("Delete questions", error);
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
      await assertEditable(tx, exam.exam_id);

      // Bulk import fills Set A; Set B is made with "Duplicate as Set B".
      const max = await tx.tbl_exam_question.aggregate({
        where: { exam_id: exam.exam_id, set_label: BASE_SET },
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
/** Parses an uploaded CSV/XLSX (base64) into preview rows. Does not write anything. */
export async function previewAnswerKeyFile(filename: string, base64: string): Promise<PreviewResult> {
  await requirePermission("admission", "write");

  if (!base64) return { error: "No file provided." };
  if (base64.length > 4_000_000) return { error: "File is too large (about 3 MB max)." };

  try {
    const { records, headers } = await readQuestionFile(filename, Buffer.from(base64, "base64"));

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

/**
 * Imports validated rows produced by the file-import preview into Set A.
 * mode "add": every row is a new question (numbers must be free).
 * mode "update": a row whose number already exists updates that question
 * (text, choices, answer, points, subject); other rows are added.
 */
export async function bulkCreateQuestionsFromRows(
  cycleIdInput: number,
  rowsInput: BulkQuestionRow[],
  modeInput: "add" | "update" = "add",
): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };
  const mode = modeInput === "update" ? "update" : "add";

  const parsed = bulkQuestionRowsSchema.safeParse(rowsInput);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rows = parsed.data;
  if (mode === "update" && rows.some((r) => r.question_no === null)) {
    return { error: "To update existing questions, every row needs a question number." };
  }

  try {
    const { added, updated } = await prisma.$transaction(
      async (tx) => {
        const exam = await getCycleExam(cycleId, tx);
        if (!exam) throw new Error("Create the exam for this school year first.");
        await assertEditable(tx, exam.exam_id);

        const existing = await tx.tbl_exam_question.findMany({
          where: { exam_id: exam.exam_id, set_label: BASE_SET },
          select: { question_id: true, question_no: true },
        });
        const idByNo = new Map(existing.map((q) => [q.question_no, q.question_id]));
        const maxNo = existing.reduce((m, q) => Math.max(m, q.question_no), 0);

        // Honor explicit numbers only when every row has one; otherwise append in order.
        const hasExplicit = rows.every((r) => r.question_no !== null);
        const seen = new Set<number>();
        const numbered = rows.map((r, i) => {
          const no = hasExplicit ? (r.question_no as number) : maxNo + 1 + i;
          if (hasExplicit) {
            if (seen.has(no)) throw new Error(`Duplicate question number ${no} in the file.`);
            if (mode === "add" && idByNo.has(no)) {
              throw new Error(`Question #${no} already exists. Choose "Update existing questions" to change it.`);
            }
            seen.add(no);
          }
          return {
            question_no: no,
            question_text: r.question_text,
            choice_a: r.choice_a,
            choice_b: r.choice_b,
            choice_c: r.choice_c,
            choice_d: r.choice_d,
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

        const toUpdate = numbered.filter((r) => idByNo.has(r.question_no));
        const toCreate = numbered.filter((r) => !idByNo.has(r.question_no));
        for (const row of toUpdate) {
          await tx.tbl_exam_question.update({ where: { question_id: idByNo.get(row.question_no)! }, data: row });
        }
        if (toCreate.length > 0) {
          await tx.tbl_exam_question.createMany({
            data: toCreate.map((row) => ({ ...row, exam_id: exam.exam_id, set_label: BASE_SET })),
          });
        }
        return { added: toCreate.length, updated: toUpdate.length };
      },
      { timeout: 60_000 },
    );

    revalidate();
    const parts = [
      added ? `${added} question${added === 1 ? "" : "s"} added` : "",
      updated ? `${updated} updated` : "",
    ].filter(Boolean);
    return { success: true, message: `${parts.join(", ") || "Nothing changed"}.` };
  } catch (error) {
    return failure("Bulk import", error);
  }
}
