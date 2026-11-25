import { Suspense } from "react";
import { connection } from "next/server";

import {
  ExamQuestions,
  type CompetencyOption,
  type ExamInfo,
  type ExamSessionOption,
  type QuestionRow,
  type ResponseStat,
} from "@/components/admission/exam-questions";
import { FilterSelect } from "@/components/admission/filter-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { resolveCycle } from "@/features/admission/admission-stats";
import { isExamDatePassed, isExamLocked } from "@/features/admission/exam";
import { manilaTodayIso, toExamSet } from "@/features/admission/exam-scoring";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TablePageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string | string[]; set?: string | string[] }> }>;

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

async function QuestionsContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);
  const requestedSet = toExamSet(Array.isArray(params.set) ? params.set[0] : params.set);

  if (!cycle) {
    return (
      <div className="p-4">
        <h1 className="sr-only">Exam questions</h1>
        <p className="rounded-md border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      </div>
    );
  }

  // Full exam record for this cycle (more fields than getCycleExam returns).
  const exam = await prisma.tbl_exam.findFirst({
    where: { cycle_id: cycle.cycle_id },
    orderBy: [{ exam_date: { sort: "desc", nulls: "last" } }, { exam_id: "desc" }],
    select: { exam_id: true, exam_name: true, exam_date: true, max_score: true, total_items: true, edit_unlocked: true },
  });

  // Questions per set; show the requested set (Set A when Set B doesn't exist).
  const setCounts = exam
    ? await prisma.tbl_exam_question.groupBy({ by: ["set_label"], where: { exam_id: exam.exam_id }, _count: { _all: true } })
    : [];
  const countOf = (set: string) => setCounts.find((s) => s.set_label === set)?._count._all ?? 0;
  const hasSetB = countOf("B") > 0;
  const currentSet = requestedSet === "B" && hasSetB ? "B" : "A";

  const [rawQuestions, rawCompetencies, responseGroups] = await Promise.all([
    exam
      ? prisma.tbl_exam_question.findMany({
          where: { exam_id: exam.exam_id, set_label: currentSet },
          orderBy: { question_no: "asc" },
          select: {
            question_id: true,
            question_no: true,
            question_text: true,
            choice_a: true,
            choice_b: true,
            choice_c: true,
            choice_d: true,
            correct_answer: true,
            points: true,
            competency_id: true,
            tbl_competency: { select: { competency_name: true } },
          },
        })
      : Promise.resolve([]),
    prisma.tbl_competency.findMany({
      orderBy: { competency_name: "asc" },
      select: { competency_id: true, competency_name: true },
    }),
    exam
      ? prisma.tbl_question_response.groupBy({
          by: ["question_id", "is_correct"],
          where: { tbl_exam_question: { exam_id: exam.exam_id, set_label: currentSet } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const questions: QuestionRow[] = rawQuestions.map((q) => ({
    question_id: q.question_id,
    question_no: q.question_no,
    question_text: q.question_text,
    choices: [q.choice_a, q.choice_b, q.choice_c, q.choice_d].every((c) => c)
      ? [q.choice_a!, q.choice_b!, q.choice_c!, q.choice_d!]
      : null,
    correct_answer: q.correct_answer,
    points: q.points,
    competency_id: q.competency_id,
    competency_name: q.tbl_competency?.competency_name ?? null,
  }));

  const competencies: CompetencyOption[] = rawCompetencies.map((c) => ({
    competency_id: c.competency_id,
    competency_name: c.competency_name,
  }));

  // Per-question answer stats (correct / wrong counts), when applicants have responses.
  const responseStats: ResponseStat[] = rawQuestions
    .map((q) => {
      const groups = responseGroups.filter((g) => g.question_id === q.question_id);
      const correct = groups.find((g) => g.is_correct === true)?._count._all ?? 0;
      const wrong = groups.filter((g) => g.is_correct !== true).reduce((s, g) => s + g._count._all, 0);
      return { question_id: q.question_id, correct, wrong };
    })
    .filter((s) => s.correct + s.wrong > 0);

  const examInfo: ExamInfo | null = exam
    ? {
        exam_name: exam.exam_name,
        exam_date: exam.exam_date ? dateFormat.format(exam.exam_date) : null,
        declared_max: exam.max_score,
        declared_items: exam.total_items,
      }
    : null;

  // Raw values for the edit form (empty strings when unset).
  const examDefaults = exam
    ? {
        exam_name: exam.exam_name,
        exam_date: exam.exam_date ? exam.exam_date.toISOString().slice(0, 10) : "",
        total_items: exam.total_items != null ? String(exam.total_items) : "",
        max_score: exam.max_score != null ? String(exam.max_score) : "",
      }
    : null;

  // An exam is locked for editing once its exam date has passed (Manila time).
  // On the exam day itself it stays editable; only strictly-past dates lock it.
  // Admission can unlock a locked exam for editing (same rule as the server actions).
  const manilaToday = manilaTodayIso();
  const datePassed = exam ? isExamDatePassed(exam.exam_date) : false;
  const isLocked = exam ? isExamLocked(exam) : false;

  // Upcoming exam sessions (today or later) offered in the "Answer sheets" picker.
  const rawSessions = exam
    ? await prisma.tbl_exam_session.findMany({
        where: { exam_id: exam.exam_id, archived_at: null, session_date: { gte: new Date(`${manilaToday}T00:00:00Z`) } },
        orderBy: [{ session_date: "asc" }, { start_time: "asc" }],
        select: {
          session_id: true,
          session_date: true,
          start_time: true,
          venue: true,
          room: true,
          _count: { select: { tbl_exam_session_applicant: true } },
        },
      })
    : [];

  const examSessions: ExamSessionOption[] = rawSessions.map((s) => {
    const where = s.room ? ` · ${s.room}` : s.venue ? ` · ${s.venue}` : "";
    return {
      session_id: s.session_id,
      label: `${dateFormat.format(s.session_date)}${s.start_time ? ` · ${s.start_time}` : ""}${where}`,
      assigned: s._count.tbl_exam_session_applicant,
    };
  });

  return (
    <div className="relative isolate min-h-full p-3 sm:p-4">
      <QcuWatermark />
      <h1 className="sr-only">Exam questions, school year {cycle.school_year}</h1>

      <ExamQuestions
        cycleId={cycle.cycle_id}
        schoolYear={cycle.school_year}
        questions={questions}
        competencies={competencies}
        examId={exam?.exam_id ?? null}
        examInfo={examInfo}
        examDefaults={examDefaults}
        responseStats={responseStats}
        examSessions={examSessions}
        canWrite={canWrite && !isLocked}
        canManage={canWrite}
        isLocked={isLocked}
        isUnlocked={datePassed && !isLocked}
        currentSet={currentSet}
        setCounts={{ A: countOf("A"), B: countOf("B") }}
        yearFilter={
          <FilterSelect
            key="school-year"
            param="cycle"
            label="School year"
            value={String(cycle.cycle_id)}
            options={cycles.map((c) => ({ value: String(c.cycle_id), label: `S.Y. ${c.school_year}` }))}
          />
        }
      />
    </div>
  );
}

export default function ExamQuestionsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<TablePageSkeleton label="exam questions" cols={5} />}>
      <QuestionsContent searchParams={searchParams} />
    </Suspense>
  );
}
