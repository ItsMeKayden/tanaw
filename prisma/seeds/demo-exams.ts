/**
 * Demo data for the Exam Schedule and Exam Scores pages:
 *
 *   tbl_exam_session            3 sittings: two on exam day, one upcoming
 *   tbl_exam_session_applicant  seats + attendance for demo applicants
 *   tbl_exam_subject_score      per-subject scores for demo exam results
 *
 * Applicants are picked by their current stage and results, so this stays
 * correct after demo applicants are edited in the app. Idempotent: sessions
 * are matched by exam + date + venue + room, seats and scores are only added
 * where missing, and only DEMO- applications are touched.
 */
import { ADMISSION_STAGES } from "../../features/admission/stages";
import { log, prisma, warn } from "./client";

const DEMO_PREFIX = "DEMO-";

type DemoSession = {
  key: "morning" | "afternoon" | "upcoming";
  date: string;
  time: string;
  venue: string;
  room: string;
  capacity: number;
};

/** Exam day matches the demo exam's date (2026-09-12); the upcoming one is open for seating. */
export const DEMO_SESSIONS: DemoSession[] = [
  { key: "morning", date: "2026-09-12", time: "08:00", venue: "QCU San Bartolome Campus, Main Building", room: "201", capacity: 15 },
  { key: "afternoon", date: "2026-09-12", time: "13:00", venue: "QCU San Bartolome Campus, Main Building", room: "202", capacity: 15 },
  { key: "upcoming", date: "2026-12-05", time: "08:00", venue: "QCU Batasan Campus, Academic Building", room: "105", capacity: 5 },
];

const sessionWhere = (examId: number, s: DemoSession) => ({
  exam_id: examId,
  session_date: new Date(`${s.date}T00:00:00.000Z`),
  venue: s.venue,
  room: s.room,
});

/** Removes the demo sessions (their seats cascade). Real sessions are untouched. */
export async function resetDemoExamSessions(examId: number) {
  let removed = 0;
  for (const s of DEMO_SESSIONS) {
    const { count } = await prisma.tbl_exam_session.deleteMany({ where: sessionWhere(examId, s) });
    removed += count;
  }
  log("demo", `removed ${removed} demo exam sessions`);
}

/**
 * Exam-day sessions seat everyone with an exam result (marked Present) plus
 * one "For Examination" applicant marked Absent; the upcoming session seats
 * the remaining "For Examination" applicants except one, left unscheduled so
 * "Fill seats" has someone to add.
 */
export async function seedDemoExamSchedule(examId: number, markedBy: number | null) {
  const sessions: Record<DemoSession["key"], number> = { morning: 0, afternoon: 0, upcoming: 0 };
  let createdSessions = 0;

  for (const s of DEMO_SESSIONS) {
    const existing = await prisma.tbl_exam_session.findFirst({ where: sessionWhere(examId, s), select: { session_id: true } });
    if (existing) {
      sessions[s.key] = existing.session_id;
      continue;
    }
    const created = await prisma.tbl_exam_session.create({
      data: { ...sessionWhere(examId, s), start_time: s.time, capacity: s.capacity, created_by: markedBy },
      select: { session_id: true },
    });
    sessions[s.key] = created.session_id;
    createdSessions++;
  }

  // Demo applications without a seat yet, in application order.
  const unseated = await prisma.tbl_application.findMany({
    where: {
      application_no: { startsWith: DEMO_PREFIX },
      tbl_exam_session_applicant: { is: null },
    },
    orderBy: { application_no: "asc" },
    select: {
      application_id: true,
      tbl_admission_stage: { select: { stage_name: true } },
      tbl_exam_result: { where: { exam_id: examId }, select: { result_id: true }, take: 1 },
    },
  });

  const examined = unseated.filter((a) => a.tbl_exam_result.length > 0);
  const waiting = unseated.filter(
    (a) => a.tbl_exam_result.length === 0 && a.tbl_admission_stage?.stage_name === ADMISSION_STAGES.FOR_EXAMINATION,
  );

  const now = new Date("2026-09-12T17:00:00.000Z");
  const seats: {
    session_id: number;
    application_id: number;
    attendance: string | null;
    marked_by: number | null;
    marked_at: Date | null;
  }[] = [];

  // Took the exam: split across the two exam-day sessions, all present.
  examined.forEach((a, index) => {
    seats.push({
      session_id: index % 2 === 0 ? sessions.morning : sessions.afternoon,
      application_id: a.application_id,
      attendance: "PRESENT",
      marked_by: markedBy,
      marked_at: now,
    });
  });

  // Still waiting: the last one missed exam day (absent), the first ones
  // are seated in the upcoming session, and one stays unscheduled.
  if (waiting.length > 0) {
    const absent = waiting[waiting.length - 1];
    seats.push({ session_id: sessions.afternoon, application_id: absent.application_id, attendance: "ABSENT", marked_by: markedBy, marked_at: now });
    for (const a of waiting.slice(0, Math.max(0, waiting.length - 2))) {
      seats.push({ session_id: sessions.upcoming, application_id: a.application_id, attendance: null, marked_by: null, marked_at: null });
    }
  }

  if (seats.length > 0) {
    await prisma.tbl_exam_session_applicant.createMany({ data: seats, skipDuplicates: true });
  }

  log(
    "demo",
    `exam sessions: ${DEMO_SESSIONS.length} (${createdSessions} new), ${seats.length} new seats ` +
      `(${seats.filter((s) => s.attendance === "PRESENT").length} present, ` +
      `${seats.filter((s) => s.attendance === "ABSENT").length} absent, ` +
      `${seats.filter((s) => s.attendance === null).length} not marked)`,
  );
}

/**
 * Per-subject scores for demo exam results that have none, totalled from
 * their question responses (so totals and recommendations don't change).
 */
export async function seedDemoSubjectScores(examId: number) {
  const results = await prisma.tbl_exam_result.findMany({
    where: {
      exam_id: examId,
      tbl_exam_subject_score: { none: {} },
      tbl_question_response: { some: {} },
      tbl_application: { application_no: { startsWith: DEMO_PREFIX } },
    },
    select: {
      result_id: true,
      tbl_question_response: {
        select: {
          points_earned: true,
          is_correct: true,
          tbl_exam_question: { select: { competency_id: true, points: true } },
        },
      },
    },
  });

  if (results.length === 0) {
    log("demo", "subject scores: none missing");
    return;
  }

  let rows = 0;
  for (const result of results) {
    const byCompetency = new Map<number, { score: number; max: number }>();
    for (const r of result.tbl_question_response) {
      const competencyId = r.tbl_exam_question.competency_id;
      if (competencyId === null) continue;
      const entry = byCompetency.get(competencyId) ?? { score: 0, max: 0 };
      entry.max += r.tbl_exam_question.points;
      entry.score += r.points_earned ?? (r.is_correct ? r.tbl_exam_question.points : 0);
      byCompetency.set(competencyId, entry);
    }
    if (byCompetency.size === 0) {
      warn("demo", `result ${result.result_id} has no competency-tagged answers; subject scores skipped.`);
      continue;
    }

    const { count } = await prisma.tbl_exam_subject_score.createMany({
      data: [...byCompetency].map(([competency_id, { score, max }]) => ({
        result_id: result.result_id,
        competency_id,
        score,
        max_score: max,
      })),
      skipDuplicates: true,
    });
    rows += count;
  }

  log("demo", `subject scores for ${results.length} exam results (${rows} rows)`);
}
