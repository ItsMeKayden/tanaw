// Server-side helpers shared by the Exam Schedule and Exam Scores pages.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { shortCompetencyName } from "@/features/recommendation/config";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ATTENDANCE, BASE_SET, manilaTodayIso } from "@/features/admission/exam-scoring";
import { ADMISSION_STAGES } from "@/features/admission/stages";

type Db = Prisma.TransactionClient;

/**
 * True when a session's end time (date + time, Asia/Manila) has passed.
 * End time is optional (and sessions created before it existed have none):
 * those count as finished once their exam day is over (midnight, Asia/Manila).
 */
export function isSessionFinished(sessionDate: Date, endTime: string | null): boolean {
  // The DATE column is the PH date at UTC midnight.
  const dateStr = sessionDate.toISOString().slice(0, 10);
  if (!endTime) {
    const nextDay = new Date(`${dateStr}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000;
    return nextDay <= Date.now();
  }
  const [h, m] = endTime.split(":").map(Number);
  const finishStr = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`;
  return new Date(finishStr).getTime() < Date.now();
}

/** Epoch ms of a session's date + "HH:MM" time in Asia/Manila (null without a time). */
export function sessionInstant(sessionDate: Date, time: string | null): number | null {
  if (!time) return null;
  const dateStr = sessionDate.toISOString().slice(0, 10);
  const [h, m] = time.split(":").map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`).getTime();
}

/** The next future start or end time (epoch ms) among the sessions, or null. */
export function nextSessionChangeAt(
  sessions: { session_date: Date; start_time: string | null; end_time: string | null }[],
): number | null {
  const now = Date.now();
  const upcoming = sessions
    .flatMap((s) => [sessionInstant(s.session_date, s.start_time), sessionInstant(s.session_date, s.end_time)])
    .filter((t): t is number => t !== null && t > now);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

/**
 * True once a session's start time (date + time, Asia/Manila) has passed.
 * Without a start time it counts as started at the beginning of its day.
 */
export function isSessionStarted(sessionDate: Date, startTime: string | null): boolean {
  const dateStr = sessionDate.toISOString().slice(0, 10);
  const [h, m] = (startTime ?? "00:00").split(":").map(Number);
  const startStr = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`;
  return new Date(startStr).getTime() <= Date.now();
}

/**
 * "For Examination" applicants of a cycle (no exam score) who need a seat,
 * earliest application first: no seat yet, or their seat is in an archived
 * session, or in a finished session they weren't marked present at (missed
 * it). previousSessionId is set when their seat has to be moved.
 */
export async function getApplicantsToSchedule(db: Db | typeof prisma, cycleId: number) {
  const applications = await db.tbl_application.findMany({
    where: {
      ...ACTIVE_APPLICATION,
      cycle_id: cycleId,
      tbl_admission_stage: { stage_name: ADMISSION_STAGES.FOR_EXAMINATION },
      tbl_exam_result: { none: {} },
    },
    orderBy: [{ application_date: "asc" }, { application_id: "asc" }],
    select: {
      application_id: true,
      tbl_exam_session_applicant: {
        select: {
          session_id: true,
          attendance: true,
          tbl_exam_session: { select: { session_date: true, end_time: true, archived_at: true } },
        },
      },
    },
  });

  return applications.flatMap((application) => {
    const seat = application.tbl_exam_session_applicant;
    if (!seat) return [{ application_id: application.application_id, previousSessionId: null as number | null }];
    const session = seat.tbl_exam_session;
    const missed =
      session.archived_at !== null ||
      (isSessionFinished(session.session_date, session.end_time) && seat.attendance !== ATTENDANCE.PRESENT);
    return missed ? [{ application_id: application.application_id, previousSessionId: seat.session_id }] : [];
  });
}

/** True when the exam date (Asia/Manila) is before today; the exam day itself stays open. */
export function isExamDatePassed(examDate: Date | null): boolean {
  return examDate !== null && examDate.toISOString().slice(0, 10) < manilaTodayIso();
}

/**
 * Questions lock once the exam date has passed, so the answer key stays
 * stable for applicants who took it, unless Admission unlocked them.
 */
export function isExamLocked(exam: { exam_date: Date | null; edit_unlocked: boolean }): boolean {
  return isExamDatePassed(exam.exam_date) && !exam.edit_unlocked;
}

/** Default exam size when the exam has no max_score and no questions. */
const DEFAULT_EXAM_MAX = 100;

/** The cycle's admission exam (latest by date, then id), or null. */
export function getCycleExam(cycleId: number, db: Db = prisma) {
  return db.tbl_exam.findFirst({
    where: { cycle_id: cycleId },
    orderBy: [{ exam_date: { sort: "desc", nulls: "last" } }, { exam_id: "desc" }],
    select: { exam_id: true, exam_name: true, exam_date: true, max_score: true },
  });
}

/** The cycle's exam, created as "Admission Exam <school year>" when missing. */
export async function ensureCycleExam(db: Db, cycleId: number) {
  const existing = await getCycleExam(cycleId, db);
  if (existing) return existing;

  const cycle = await db.tbl_admission_cycle.findUnique({
    where: { cycle_id: cycleId },
    select: { school_year: true },
  });
  if (!cycle) throw new Error("Admission cycle not found.");

  return db.tbl_exam.create({
    data: { cycle_id: cycleId, exam_name: `Admission Exam ${cycle.school_year}` },
    select: { exam_id: true, exam_name: true, exam_date: true, max_score: true },
  });
}

export type ExamSubject = {
  competency_id: number;
  name: string;
  short: string;
  max: number;
};

/**
 * Score columns for an exam: its competencies with the points of their
 * questions. An exam without questions splits its max score (default 100)
 * evenly over all competencies, giving any remainder to the first ones.
 */
export async function getExamSubjects(
  exam: { exam_id: number; max_score: number | null } | null,
  db: Db = prisma,
): Promise<ExamSubject[]> {
  const [competencies, questionPoints] = await Promise.all([
    db.tbl_competency.findMany({
      orderBy: { competency_id: "asc" },
      select: { competency_id: true, competency_name: true },
    }),
    exam
      ? db.tbl_exam_question.groupBy({
          by: ["competency_id"],
          // Sets are copies with the same subjects and points: Set A defines the totals.
          where: { exam_id: exam.exam_id, set_label: BASE_SET },
          _sum: { points: true },
        })
      : Promise.resolve([]),
  ]);

  const toSubject = (c: { competency_id: number; competency_name: string }, max: number) => ({
    competency_id: c.competency_id,
    name: c.competency_name,
    short: shortCompetencyName(c.competency_name),
    max,
  });

  const fromQuestions = competencies
    .map((c) => toSubject(c, questionPoints.find((q) => q.competency_id === c.competency_id)?._sum.points ?? 0))
    .filter((s) => s.max > 0);
  if (fromQuestions.length > 0) return fromQuestions;

  if (competencies.length === 0) return [];
  const total = exam?.max_score && exam.max_score > 0 ? exam.max_score : DEFAULT_EXAM_MAX;
  const base = Math.floor(total / competencies.length);
  const extra = total % competencies.length;
  return competencies.map((c, i) => toSubject(c, base + (i < extra ? 1 : 0)));
}

export type PassingRule = {
  /** Passing value as stored (percent, or raw points for POINTS). */
  value: number;
  /** true = compare raw points; false = compare percentage. */
  byPoints: boolean;
};

/** Latest passing-score setting of a cycle, or null when none is set. */
export async function getPassingRule(cycleId: number, db: Db = prisma): Promise<PassingRule | null> {
  const setting = await db.tbl_passing_score_setting.findFirst({
    where: { cycle_id: cycleId, passing_value: { not: null } },
    orderBy: [{ effective_date: { sort: "desc", nulls: "last" } }, { setting_id: "desc" }],
    select: { passing_value: true, criteria_type: true },
  });
  if (!setting?.passing_value) return null;

  return {
    value: Number(setting.passing_value),
    byPoints: (setting.criteria_type ?? "").toUpperCase() === "POINTS",
  };
}
