import { Suspense } from "react";
import { connection } from "next/server";

import { ExamScoreGrid, type ScoreRow } from "@/components/admission/exam-score-grid";
import { FilterSelect } from "@/components/admission/filter-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { resolveCycle } from "@/features/admission/admission-stats";
import { formatFullName } from "@/features/admission/enrollment-queries";
import { getCycleExam, getExamSubjects, getPassingRule } from "@/features/admission/exam";
import { ATTENDANCE } from "@/features/admission/exam-scoring";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { GridEditorSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[] }>;
}>;

function toAttendance(value: string | null | undefined): ScoreRow["attendance"] {
  if (value === ATTENDANCE.PRESENT || value === ATTENDANCE.ABSENT) return value;
  return null;
}

/** Applicants who are taking or have taken the exam. */
const EXAM_STAGES = [
  ADMISSION_STAGES.FOR_EXAMINATION,
  ADMISSION_STAGES.EXAM_COMPLETED,
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.WAITLISTED,
  ADMISSION_STAGES.FAILED,
  ADMISSION_STAGES.ENROLLED,
  ADMISSION_STAGES.NOT_ENROLLED,
];

async function ScoresContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);

  if (!cycle) {
    return (
      <div className="p-4">
        <h1 className="sr-only">Exam scores</h1>
        <p className="rounded-md border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      </div>
    );
  }

  const exam = await getCycleExam(cycle.cycle_id);
  const [subjects, rule, applications] = await Promise.all([
    getExamSubjects(exam),
    getPassingRule(cycle.cycle_id),
    prisma.tbl_application.findMany({
      where: {
        ...ACTIVE_APPLICATION,
        cycle_id: cycle.cycle_id,
        OR: [
          { tbl_admission_stage: { stage_name: { in: EXAM_STAGES } } },
          ...(exam ? [{ tbl_exam_result: { some: { exam_id: exam.exam_id } } }] : []),
        ],
      },
      orderBy: { application_no: "asc" },
      select: {
        application_id: true,
        application_no: true,
        tbl_applicant: { select: { first_name: true, middle_name: true, last_name: true, suffix: true } },
        tbl_exam_session_applicant: { select: { attendance: true } },
        tbl_exam_result: {
          where: { exam_id: exam?.exam_id ?? -1 },
          orderBy: { result_id: "desc" },
          take: 1,
          select: {
            result_id: true,
            raw_score: true,
            result_status: true,
            tbl_exam_subject_score: { select: { competency_id: true, score: true } },
            _count: { select: { tbl_question_response: true } },
          },
        },
      },
    }),
  ]);

  // Results without saved subject scores are prefilled from their imported answers.
  const fromResponses = applications
    .map((a) => a.tbl_exam_result[0])
    .filter((r) => r && r.tbl_exam_subject_score.length === 0 && r._count.tbl_question_response > 0)
    .map((r) => r.result_id);

  const responseTotals =
    fromResponses.length > 0
      ? await prisma.$queryRaw<{ result_id: number; competency_id: number; earned: bigint }[]>`
          SELECT qr.result_id, q.competency_id,
                 SUM(COALESCE(qr.points_earned, CASE WHEN qr.is_correct THEN q.points ELSE 0 END)) AS earned
          FROM tbl_question_response qr
          JOIN tbl_exam_question q ON q.question_id = qr.question_id
          WHERE qr.result_id = ANY(${fromResponses}) AND q.competency_id IS NOT NULL
          GROUP BY qr.result_id, q.competency_id`
      : [];

  const rows: ScoreRow[] = applications.map((application) => {
    const result = application.tbl_exam_result[0];
    const scores: Record<number, number | null> = {};
    for (const subject of subjects) {
      const typed = result?.tbl_exam_subject_score.find((s) => s.competency_id === subject.competency_id);
      const answered = responseTotals.find(
        (r) => r.result_id === result?.result_id && r.competency_id === subject.competency_id,
      );
      let score: number | null = null;
      if (typed) score = typed.score;
      else if (answered) score = Number(answered.earned);
      scores[subject.competency_id] = score;
    }
    return {
      application_id: application.application_id,
      application_no: application.application_no,
      name: formatFullName(application.tbl_applicant),
      scores,
      savedTotal: result?.raw_score ?? null,
      savedPassed: result?.result_status ? result.result_status === EXAM_RESULT_PASSED : null,
      attendance: toAttendance(application.tbl_exam_session_applicant?.attendance),
    };
  });

  // Shown in the grid's filter row, next to search and the applicants filter.
  const yearFilter = (
    <FilterSelect
      key="school-year"
      param="cycle"
      label="School year"
      value={String(cycle.cycle_id)}
      options={cycles.map((c) => ({ value: String(c.cycle_id), label: `S.Y. ${c.school_year}` }))}
    />
  );

  return (
    <div className="relative isolate min-h-full space-y-3 p-3 sm:p-4">
      <QcuWatermark />
      <h1 className="sr-only">Exam scores, school year {cycle.school_year}</h1>

      {subjects.length === 0 ? (
        <>
          {yearFilter}
          <p className="rounded-md border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
            No exam subjects are set up. Add competencies in the Course Recommendation module first.
          </p>
        </>
      ) : (
        <ExamScoreGrid
          key={cycle.cycle_id}
          cycleId={cycle.cycle_id}
          subjects={subjects}
          rule={rule}
          rows={rows}
          canWrite={canWrite}
          yearFilter={yearFilter}
        />
      )}
    </div>
  );
}

export default function ExamScoresPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<GridEditorSkeleton label="exam scores" cols={8} rows={8} />}>
      <ScoresContent searchParams={searchParams} />
    </Suspense>
  );
}
