"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import Papa from "papaparse";

import type { Prisma } from "@/generated/prisma/client";
import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ensureCycleExam, getCycleExam, getExamSubjects, getPassingRule, type PassingRule } from "@/features/admission/exam";
import { ATTENDANCE, BASE_SET, isPassing, scorePercent, toExamSet, type ExamSet } from "@/features/admission/exam-scoring";
import { formatFullName } from "@/features/admission/enrollment-queries";
import {
  gradeMarked,
  normalizeAnswer,
  type AnswerKeyItem,
  type ScannedPreviewRow,
  type ScanSubject,
} from "@/features/admission/exam-grading";
import {
  describeResultEmails,
  sendResultEmailsInBackground,
  type ResultChange,
} from "@/features/admission/result-email";
import { loadSlotTracker } from "@/features/admission/slots";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { generateRecommendations } from "@/features/recommendation/engine";

type ActionResult = { success: true; message: string } | { error: string };
type Db = Prisma.TransactionClient;

const EXAM_RESULT_FAILED = "FAILED";
const MAX_ROWS = 5000;

/** Stages that follow the exam result; Enrolled / Not Enrolled are never changed here. */
const RESULT_DRIVEN_STAGES: readonly string[] = [
  ADMISSION_STAGES.APPLICATION_SUBMITTED,
  ADMISSION_STAGES.FOR_EXAMINATION,
  ADMISSION_STAGES.EXAM_COMPLETED,
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.WAITLISTED,
  ADMISSION_STAGES.FAILED,
];

function validId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  for (const path of [
    "/admission/exam/scores",
    "/admission/exam/schedule",
    "/admission/quota",
    "/admission/enrollment-verification",
    "/admission/additional-applicants",
    "/recommendation",
  ]) {
    revalidatePath(path);
  }
}

type ResultEntry = {
  application: {
    application_id: number;
    current_stage_id: number | null;
    branch_id: number | null;
    program_id: number | null;
  };
  passed: boolean;
  /** Used to rank passers; the highest score gets a free slot first. */
  score: number;
  remarks: string;
};

const WAITLIST_NOTE = " Course quota is full; added to the waiting list.";

/**
 * Moves applications to match their exam results (only from a result-driven
 * stage) and logs each change. Failures go first so their slots are freed;
 * then passers, highest score first, go to Passed while their course has a
 * free slot and to Waitlisted once its quota is full.
 * Applicants already Passed or Waitlisted keep that stage.
 */
async function syncStages(
  db: Db,
  stages: { stage_id: number; stage_name: string }[],
  cycleId: number,
  entries: ResultEntry[],
  accountId: number,
) {
  const tracker = await loadSlotTracker(db, cycleId);
  const stageName = (id: number | null) => stages.find((s) => s.stage_id === id)?.stage_name ?? null;
  const ordered = [
    ...entries.filter((e) => !e.passed),
    ...entries.filter((e) => e.passed).sort((a, b) => b.score - a.score),
  ];

  let waitlisted = 0;
  const changes: ResultChange[] = [];
  for (const { application, passed, remarks } of ordered) {
    const current = stageName(application.current_stage_id);
    if (current !== null && !RESULT_DRIVEN_STAGES.includes(current)) continue;

    let targetName: string;
    if (!passed) {
      targetName = ADMISSION_STAGES.FAILED;
      if (current === ADMISSION_STAGES.PASSED) tracker.release(application);
    } else if (current === ADMISSION_STAGES.PASSED || current === ADMISSION_STAGES.WAITLISTED) {
      continue;
    } else {
      targetName = tracker.take(application) ? ADMISSION_STAGES.PASSED : ADMISSION_STAGES.WAITLISTED;
    }

    const target = stages.find((s) => s.stage_name === targetName);
    if (!target || target.stage_id === application.current_stage_id) continue;

    const waiting = targetName === ADMISSION_STAGES.WAITLISTED;
    await db.tbl_application.update({
      where: { application_id: application.application_id },
      data: { current_stage_id: target.stage_id },
    });
    await db.tbl_application_stage_log.create({
      data: {
        application_id: application.application_id,
        stage_id: target.stage_id,
        changed_by: accountId,
        remarks: waiting ? remarks + WAITLIST_NOTE : remarks,
      },
    });
    changes.push({ applicationId: application.application_id, from: current, to: targetName });
    if (waiting) waitlisted++;
  }
  return { moved: changes.length, waitlisted, changes };
}

const waitlistMessage = (count: number) =>
  count
    ? ` ${count} passer${count === 1 ? " was" : "s were"} added to the waiting list because the course quota is full; admit them from Additional Applicants when slots open.`
    : "";

/** Regenerates recommendations for the saved applicants; a failure doesn't undo the save. */
async function refreshRecommendations(cycleId: number, applicationIds: number[]) {
  try {
    await prisma.$transaction((tx) => generateRecommendations(tx, { cycleId, applicationIds }), { timeout: 60_000 });
    return true;
  } catch (error) {
    console.error("Refresh recommendations error:", error);
    return false;
  }
}

/** Only applicants marked present at their exam session can get a score. */
function assertAllPresent(
  applications: { application_no: string; tbl_exam_session_applicant: { attendance: string | null } | null }[],
) {
  const notPresent = applications.filter((a) => a.tbl_exam_session_applicant?.attendance !== ATTENDANCE.PRESENT);
  if (notPresent.length === 0) return;
  const list = notPresent
    .slice(0, 5)
    .map((a) => a.application_no)
    .join(", ");
  const more = notPresent.length > 5 ? ` and ${notPresent.length - 5} more` : "";
  throw new Error(
    `Scores can only be saved for applicants marked present on the Exam Schedule. Not present: ${list}${more}.`,
  );
}

type KeyItem = AnswerKeyItem & { question_id: number };

/** The exam's answer key per set ("A", "B"), in question order. */
async function loadAnswerKeys(db: Prisma.TransactionClient | typeof prisma, examId: number) {
  const questions = await db.tbl_exam_question.findMany({
    where: { exam_id: examId },
    orderBy: { question_no: "asc" },
    select: { question_id: true, set_label: true, question_no: true, correct_answer: true, points: true, competency_id: true },
  });
  const keys = new Map<ExamSet, KeyItem[]>();
  for (const q of questions) {
    const set = toExamSet(q.set_label);
    keys.set(set, [...(keys.get(set) ?? []), q]);
  }
  return keys;
}

/**
 * Saves scanned answer sheets: re-grades each applicant's marks on the
 * server with their session's set, saves the scores like the Exam Scores
 * grid (same attendance and stage rules), then stores every answer per
 * question for Item Analysis.
 */
export async function saveScannedResults(
  cycleIdInput: number,
  rowsInput: { application_id: number; answers: Record<string, string> }[],
): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "There are no rows to import." };
  if (rowsInput.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} rows at a time.` };
  const ids = rowsInput.map((r) => validId(r?.application_id));
  if (ids.some((id) => id === null)) return { error: "Invalid applicant in the import." };

  const exam = await getCycleExam(cycleId);
  if (!exam) return { error: "Create the exam for this school year first." };
  const [keys, subjects, seats] = await Promise.all([
    loadAnswerKeys(prisma, exam.exam_id),
    getExamSubjects(exam),
    prisma.tbl_exam_session_applicant.findMany({
      where: { application_id: { in: ids as number[] } },
      select: { application_id: true, tbl_exam_session: { select: { exam_set: true } } },
    }),
  ]);
  const setOf = (applicationId: number) =>
    toExamSet(seats.find((s) => s.application_id === applicationId)?.tbl_exam_session.exam_set);

  // Re-grade here: the browser only sends the marks.
  const graded = rowsInput.map((row) => {
    const set = setOf(row.application_id);
    const key = keys.get(set) ?? [];
    const marked = new Map<number, string>();
    for (const [no, letter] of Object.entries(row.answers ?? {})) {
      const mark = normalizeAnswer(String(letter));
      if (mark && Number.isInteger(Number(no))) marked.set(Number(no), mark);
    }
    const result = gradeMarked(key, marked);
    return { application_id: row.application_id, set, key, marked, byCompetency: result.byCompetency };
  });
  const missing = graded.find((g) => g.key.length === 0);
  if (missing) return { error: `Set ${missing.set} has no questions yet.` };

  const saved = await saveExamScores(
    cycleId,
    graded.map((g) => ({
      application_id: g.application_id,
      scores: subjects.map((s) => ({ competency_id: s.competency_id, score: g.byCompetency.get(s.competency_id) ?? 0 })),
    })),
  );
  if ("error" in saved) return saved;

  try {
    const results = await prisma.tbl_exam_result.findMany({
      where: { exam_id: exam.exam_id, application_id: { in: ids as number[] } },
      orderBy: { result_id: "desc" },
      select: { result_id: true, application_id: true },
    });
    await prisma.$transaction(async (tx) => {
      for (const g of graded) {
        const result = results.find((r) => r.application_id === g.application_id);
        if (!result) continue;
        await tx.tbl_question_response.deleteMany({ where: { result_id: result.result_id } });
        await tx.tbl_question_response.createMany({
          data: g.key.map((item) => {
            const mark = g.marked.get(item.question_no) ?? null;
            const correct = mark !== null && mark === normalizeAnswer(item.correct_answer);
            return {
              result_id: result.result_id,
              question_id: item.question_id,
              selected_answer: mark,
              is_correct: correct,
              points_earned: correct ? item.points : 0,
            };
          }),
        });
      }
    });
    return { success: true, message: `${saved.message} Answers saved for Item Analysis.` };
  } catch (error) {
    console.error("Save scanned answers error:", error);
    return { success: true, message: `${saved.message} The per-question answers could not be saved.` };
  }
}

type ScanPreviewResult =
  | { rows: ScannedPreviewRow[]; subjects: ScanSubject[]; maxTotal: number }
  | { error: string };

const APP_NO_COLS = [
  "application_no",
  "application no",
  "application number",
  "app_no",
  "app no",
  "appno",
  "applicant_no",
  "applicant no",
  "applicationno",
];
const ANSWER_COLS = ["answers", "answer_key", "answerkey", "responses", "response", "marks", "answer"];

function pickHeader(headers: string[], names: string[]): string | null {
  return names.find((n) => headers.includes(n)) ?? null;
}

/**
 * Parses an uploaded CSV of scanned answers and grades each row against the
 * cycle exam's key, returning preview rows (per-subject scores aligned to the
 * official subjects). Writes nothing — the client confirms with saveExamScores.
 */
export async function previewScannedResults(
  cycleIdInput: number,
  filename: string,
  base64: string,
): Promise<ScanPreviewResult> {
  await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };
  if (!base64) return { error: "No file provided." };
  if (base64.length > 6_000_000) return { error: "File is too large (about 4 MB max)." };
  if (!filename.toLowerCase().endsWith(".csv")) {
    return { error: "Upload a .csv file exported from your scanner or spreadsheet." };
  }

  try {
    const exam = await getCycleExam(cycleId);
    if (!exam) return { error: "Create the exam for this school year first." };

    const [keys, subjects] = await Promise.all([loadAnswerKeys(prisma, exam.exam_id), getExamSubjects(exam)]);
    const baseKey = keys.get(BASE_SET) ?? [];
    if (baseKey.length === 0) return { error: "This exam has no questions. Add the answer key first." };
    if (subjects.length === 0) return { error: "The exam has no subjects (competencies) set up." };

    const maxTotal = subjects.reduce((s, x) => s + x.max, 0);
    // Every set has the same question numbers; only the answer key differs.
    const questionNos = baseKey.map((k) => k.question_no);

    const parsed = Papa.parse<Record<string, string>>(Buffer.from(base64, "base64").toString("utf8"), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    const headers = (parsed.meta.fields ?? []).map((f) => f.trim().toLowerCase());

    const appNoCol = pickHeader(headers, APP_NO_COLS);
    if (!appNoCol) {
      return { error: 'Could not find an application-number column. Add a header named "application_no".' };
    }

    const answersCol = pickHeader(headers, ANSWER_COLS);
    const perQuestion = headers
      .map((h) => ({ h, m: /^(?:q|item)?\s*0*(\d+)$/.exec(h) }))
      .filter((x) => x.m)
      .map((x) => ({ header: x.h, no: Number(x.m![1]) }));

    if (!answersCol && perQuestion.length === 0) {
      return {
        error:
          'Could not find answers. Add either an "answers" column (e.g. "ABCDA") or one column per question (q1, q2, …).',
      };
    }

    const applications = await prisma.tbl_application.findMany({
      where: { cycle_id: cycleId, ...ACTIVE_APPLICATION },
      select: {
        application_id: true,
        application_no: true,
        tbl_applicant: { select: { first_name: true, middle_name: true, last_name: true, suffix: true } },
        tbl_exam_session_applicant: {
          select: { attendance: true, tbl_exam_session: { select: { exam_set: true } } },
        },
      },
    });
    const byAppNo = new Map(applications.map((a) => [a.application_no.trim().toLowerCase(), a]));

    const seen = new Set<string>();
    const rows: ScannedPreviewRow[] = parsed.data.map((rec, i) => {
      const rowNumber = i + 2;
      const appNo = (rec[appNoCol] ?? "").trim();
      const appKey = appNo.toLowerCase();

      const marked = new Map<number, string>();
      let warning: string | null = null;
      if (perQuestion.length > 0) {
        for (const { header, no } of perQuestion) {
          const v = normalizeAnswer(rec[header] ?? "");
          if (v) marked.set(no, v);
        }
      } else if (answersCol) {
        const raw = (rec[answersCol] ?? "").replace(/[\s,]+/g, "");
        for (let j = 0; j < raw.length && j < questionNos.length; j++) {
          const v = normalizeAnswer(raw[j]);
          if (v) marked.set(questionNos[j], v);
        }
        if (raw.length !== questionNos.length) {
          warning = `Answer string has ${raw.length} marks but the exam has ${questionNos.length} items.`;
        }
      }

      const app = appNo ? byAppNo.get(appKey) : undefined;
      let error: string | null = null;
      if (!appNo) error = "Missing application number.";
      else if (!app) error = `No applicant "${appNo}" in this school year.`;
      else if (seen.has(appKey)) error = `"${appNo}" appears more than once in the file.`;
      // Same rule as saveExamScores: scores only for applicants marked present.
      else if (app.tbl_exam_session_applicant?.attendance !== ATTENDANCE.PRESENT) {
        error = "Not marked present on the Exam Schedule.";
      }
      if (app) seen.add(appKey);

      // Grade with the answer key of the set the applicant's session took.
      const set = toExamSet(app?.tbl_exam_session_applicant?.tbl_exam_session.exam_set);
      const keyItems = keys.get(set) ?? [];
      if (!error && keyItems.length === 0) error = `Set ${set} has no questions yet.`;

      const graded = gradeMarked(keyItems, marked);
      const scores = subjects.map((s) => ({
        competency_id: s.competency_id,
        score: graded.byCompetency.get(s.competency_id) ?? 0,
      }));

      return {
        rowNumber,
        application_no: appNo,
        applicant_name: app?.tbl_applicant ? formatFullName(app.tbl_applicant) : null,
        application_id: app?.application_id ?? null,
        total: graded.total,
        max: maxTotal,
        percentage: maxTotal > 0 ? scorePercent(graded.total, maxTotal) : null,
        answered: graded.answered,
        questionCount: questionNos.length,
        scores,
        set,
        answers: Object.fromEntries(marked),
        error,
        warning,
      };
    });

    if (rows.length === 0) return { error: "No data rows found in the file." };
    if (rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} rows at a time.` };

    return {
      rows,
      subjects: subjects.map((s) => ({ competency_id: s.competency_id, short: s.short, max: s.max })),
      maxTotal,
    };
  } catch (error) {
    console.error("Preview scanned results error:", error);
    return { error: error instanceof Error ? error.message : "Could not read the file." };
  }
}

export type ScoreRowInput = { application_id: number; scores: { competency_id: number; score: number }[] };

/**
 * Saves complete score rows: per-subject scores (tbl_exam_subject_score),
 * the total, percentage and pass/fail (tbl_exam_result), and moves each
 * applicant to Passed / Failed. Typed subject scores take precedence over
 * imported question responses. Course recommendations for the saved
 * applicants are regenerated afterwards.
 */
export async function saveExamScores(cycleIdInput: number, rows: ScoreRowInput[]): Promise<ActionResult> {
  const user = await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "There are no changed scores to save." };
  if (rows.length > MAX_ROWS) return { error: `Save at most ${MAX_ROWS} applicants at a time.` };

  const ids = rows.map((r) => validId(r?.application_id));
  if (ids.some((id) => id === null)) return { error: "Invalid applicant in the score list." };
  if (new Set(ids).size !== ids.length) return { error: "An applicant is listed twice." };

  try {
    const accountId = getAccountId(user);

    const summary = await prisma.$transaction(
      async (tx) => {
        const [exam, rule, stages] = await Promise.all([
          ensureCycleExam(tx, cycleId),
          getPassingRule(cycleId, tx),
          tx.tbl_admission_stage.findMany({ select: { stage_id: true, stage_name: true } }),
        ]);
        if (!rule) throw new Error("Set the passing score before saving results.");

        const subjects = await getExamSubjects(exam, tx);
        if (subjects.length === 0) throw new Error("The exam has no subjects (competencies) set up.");
        const maxTotal = subjects.reduce((sum, s) => sum + s.max, 0);

        const applications = await tx.tbl_application.findMany({
          where: { application_id: { in: ids as number[] }, cycle_id: cycleId, ...ACTIVE_APPLICATION },
          select: {
            application_id: true,
            application_no: true,
            current_stage_id: true,
            branch_id: true,
            program_id: true,
            tbl_exam_session_applicant: { select: { attendance: true } },
            tbl_exam_result: {
              where: { exam_id: exam.exam_id },
              select: { result_id: true },
              orderBy: { result_id: "desc" },
            },
          },
        });
        if (applications.length !== rows.length) throw new Error("Some applicants are not in this school year. Reload the page.");

        assertAllPresent(applications);

        let passedCount = 0;
        const entries: ResultEntry[] = [];

        for (const row of rows) {
          const application = applications.find((a) => a.application_id === row.application_id)!;
          const values = subjects.map((subject) => {
            const entry = row.scores?.find((s) => s.competency_id === subject.competency_id);
            const score = Number(entry?.score);
            if (!entry || !Number.isInteger(score) || score < 0 || score > subject.max) {
              throw new Error(`${application.application_no}: ${subject.short} must be a whole number from 0 to ${subject.max}.`);
            }
            return { competency_id: subject.competency_id, score, max_score: subject.max };
          });

          const total = values.reduce((sum, v) => sum + v.score, 0);
          const percentage = scorePercent(total, maxTotal);
          const passed = isPassing(total, maxTotal, rule);
          if (passed) passedCount++;

          const data = {
            raw_score: total,
            percentage,
            result_status: passed ? EXAM_RESULT_PASSED : EXAM_RESULT_FAILED,
          };
          const existing = application.tbl_exam_result[0];
          const result = existing
            ? await tx.tbl_exam_result.update({ where: { result_id: existing.result_id }, data, select: { result_id: true } })
            : await tx.tbl_exam_result.create({
                data: { ...data, application_id: application.application_id, exam_id: exam.exam_id },
                select: { result_id: true },
              });

          await tx.tbl_exam_subject_score.deleteMany({ where: { result_id: result.result_id } });
          await tx.tbl_exam_subject_score.createMany({
            data: values.map((v) => ({ ...v, result_id: result.result_id })),
          });
          // Per-question answers no longer match typed totals; a scanned import re-adds its own.
          await tx.tbl_question_response.deleteMany({ where: { result_id: result.result_id } });

          const remarks = `Exam result saved: ${total}/${maxTotal} (${percentage}%), ${passed ? "passed" : "failed"}.`;
          entries.push({ application, passed, score: total, remarks });
        }

        const { moved, waitlisted, changes } = await syncStages(tx, stages, cycleId, entries, accountId);

        if (exam.max_score === null) {
          await tx.tbl_exam.update({ where: { exam_id: exam.exam_id }, data: { max_score: maxTotal } });
        }

        return { saved: rows.length, passed: passedCount, moved, waitlisted, changes };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // Committed: email the new results without holding up the response.
    after(() => sendResultEmailsInBackground(summary.changes));

    const recommended = await refreshRecommendations(cycleId, ids as number[]);
    revalidate();

    return {
      success: true,
      message:
        `Saved ${summary.saved} result${summary.saved === 1 ? "" : "s"} (${summary.passed} passed, ` +
        `${summary.saved - summary.passed} failed).` +
        waitlistMessage(summary.waitlisted) +
        describeResultEmails(summary.changes) +
        (recommended ? "" : " Course recommendations could not be refreshed; regenerate them on the Recommendation page."),
    };
  } catch (error) {
    console.error("Save exam scores error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong while saving results." };
  }
}

/**
 * Sets the cycle's passing score (as a new setting effective today) and
 * re-checks every saved result of the cycle against it. Applicants whose
 * result flips move between Passed and Failed; Enrolled / Not Enrolled
 * applicants keep their stage.
 */
export async function savePassingScore(cycleIdInput: number, rule: PassingRule): Promise<ActionResult> {
  const user = await requirePermission("admission", "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const value = Number(rule?.value);
  const byPoints = rule?.byPoints === true;
  if (!Number.isFinite(value) || value < 0 || (!byPoints && value > 100) || value > 99_999) {
    return { error: byPoints ? "Enter a passing score in points." : "Enter a percentage from 0 to 100." };
  }
  const rounded = Math.round(value * 100) / 100;

  try {
    const accountId = getAccountId(user);

    const { flipped: changed, waitlisted, changes } = await prisma.$transaction(
      async (tx) => {
        const cycle = await tx.tbl_admission_cycle.findUnique({ where: { cycle_id: cycleId }, select: { cycle_id: true } });
        if (!cycle) throw new Error("Admission cycle not found.");

        const previous = await tx.tbl_passing_score_setting.findFirst({
          where: { cycle_id: cycleId },
          orderBy: [{ effective_date: { sort: "desc", nulls: "last" } }, { setting_id: "desc" }],
          select: { target_pass_rate: true },
        });

        const today = new Date();
        await tx.tbl_passing_score_setting.create({
          data: {
            cycle_id: cycleId,
            updated_by: accountId,
            criteria_type: byPoints ? "POINTS" : "PERCENTAGE",
            passing_value: rounded,
            target_pass_rate: previous?.target_pass_rate ?? null,
            effective_date: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
          },
        });

        const [stages, results] = await Promise.all([
          tx.tbl_admission_stage.findMany({ select: { stage_id: true, stage_name: true } }),
          tx.tbl_exam_result.findMany({
            where: { tbl_application: { cycle_id: cycleId, ...ACTIVE_APPLICATION }, raw_score: { not: null } },
            select: {
              result_id: true,
              raw_score: true,
              percentage: true,
              result_status: true,
              tbl_application: {
                select: { application_id: true, current_stage_id: true, branch_id: true, program_id: true },
              },
            },
          }),
        ]);

        let flipped = 0;
        const entries: ResultEntry[] = [];
        for (const result of results) {
          if (!result.tbl_application || result.raw_score === null) continue;
          const pct = result.percentage === null ? null : Number(result.percentage);
          const passed = byPoints ? result.raw_score >= rounded : pct !== null && pct >= rounded;
          const status = passed ? EXAM_RESULT_PASSED : EXAM_RESULT_FAILED;
          if (status === result.result_status) continue;

          await tx.tbl_exam_result.update({ where: { result_id: result.result_id }, data: { result_status: status } });
          entries.push({
            application: result.tbl_application,
            passed,
            score: pct ?? result.raw_score,
            remarks: `Passing score changed to ${byPoints ? `${rounded} pts` : `${rounded}%`}; result is now ${passed ? "passed" : "failed"}.`,
          });
          flipped++;
        }
        const { waitlisted, changes } = await syncStages(tx, stages, cycleId, entries, accountId);
        return { flipped, waitlisted, changes };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    after(() => sendResultEmailsInBackground(changes));

    revalidate();
    return {
      success: true,
      message: `Passing score saved.${changed ? ` ${changed} result${changed === 1 ? "" : "s"} changed between passed and failed.` : ""}${waitlistMessage(waitlisted)}${describeResultEmails(changes)}`,
    };
  } catch (error) {
    console.error("Save passing score error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
