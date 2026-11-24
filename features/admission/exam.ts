// Server-side helpers shared by the Exam Schedule and Exam Scores pages.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { shortCompetencyName } from "@/features/recommendation/config";

type Db = Prisma.TransactionClient;

/** True when a session's end time (date + time, Asia/Manila) has passed. */
export function isSessionFinished(sessionDate: Date, endTime: string | null): boolean {
  if (!endTime) return false;
  const [h, m] = endTime.split(":").map(Number);
  // Build the finish instant in Asia/Manila (the DATE column is the PH date at UTC midnight).
  const dateStr = sessionDate.toISOString().slice(0, 10);
  const finishStr = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`;
  return new Date(finishStr).getTime() < Date.now();
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
          where: { exam_id: exam.exam_id },
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
