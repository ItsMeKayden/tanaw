"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ensureCycleExam, getExamSubjects, getPassingRule, type PassingRule } from "@/features/admission/exam";
import { ATTENDANCE, isPassing, scorePercent } from "@/features/admission/exam-scoring";
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

  let moved = 0;
  let waitlisted = 0;
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
    moved++;
    if (waiting) waitlisted++;
  }
  return { moved, waitlisted };
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

export type ScoreRowInput ={ application_id: number; scores: { competency_id: number; score: number }[] };

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

          const remarks = `Exam result saved: ${total}/${maxTotal} (${percentage}%), ${passed ? "passed" : "failed"}.`;
          entries.push({ application, passed, score: total, remarks });
        }

        const { moved, waitlisted } = await syncStages(tx, stages, cycleId, entries, accountId);

        if (exam.max_score === null) {
          await tx.tbl_exam.update({ where: { exam_id: exam.exam_id }, data: { max_score: maxTotal } });
        }

        return { saved: rows.length, passed: passedCount, moved, waitlisted };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    const recommended = await refreshRecommendations(cycleId, ids as number[]);
    revalidate();

    return {
      success: true,
      message:
        `Saved ${summary.saved} result${summary.saved === 1 ? "" : "s"} (${summary.passed} passed, ` +
        `${summary.saved - summary.passed} failed).` +
        waitlistMessage(summary.waitlisted) +
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

    const { flipped: changed, waitlisted } = await prisma.$transaction(
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
        const { waitlisted } = await syncStages(tx, stages, cycleId, entries, accountId);
        return { flipped, waitlisted };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    revalidate();
    return {
      success: true,
      message: `Passing score saved.${changed ? ` ${changed} result${changed === 1 ? "" : "s"} changed between passed and failed.` : ""}${waitlistMessage(waitlisted)}`,
    };
  } catch (error) {
    console.error("Save passing score error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
