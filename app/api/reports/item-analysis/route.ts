import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { parseExportFormat, reportResponse } from "@/features/reports/report";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasPermission(session.user.role, "reports", "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { cycle } = await resolveCycle(params.get("cycle") ?? undefined);
  const campusId = Number(params.get("campus") ?? 0) || null;
  const examId = Number(params.get("exam") ?? 0) || null;
  const subject = params.get("subject") && params.get("subject") !== "all" ? params.get("subject") : null;
  const base = {
    ...(cycle ? { cycle_id: cycle.cycle_id } : {}),
    ...(campusId ? { branch_id: campusId } : {}),
  };

  const [examined, passed, campus, exam, programs] = await Promise.all([
    prisma.tbl_exam_result.count({ where: { tbl_application: base } }),
    prisma.tbl_exam_result.count({ where: { tbl_application: base, result_status: EXAM_RESULT_PASSED } }),
    campusId ? prisma.tbl_branch.findUnique({ where: { branch_id: campusId }, select: { branch_name: true } }) : null,
    examId ? prisma.tbl_exam.findUnique({ where: { exam_id: examId }, select: { exam_name: true } }) : null,
    prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true, program_name: true } }),
  ]);

  // --- Passing rate by course ---
  const courses = await Promise.all(programs.map(async (program) => {
    const [courseExamined, coursePassed] = await Promise.all([
      prisma.tbl_exam_result.count({ where: { tbl_application: { ...base, program_id: program.program_id } } }),
      prisma.tbl_exam_result.count({ where: { tbl_application: { ...base, program_id: program.program_id }, result_status: EXAM_RESULT_PASSED } }),
    ]);
    return {
      code: program.program_code,
      name: program.program_name,
      examined: courseExamined,
      passed: coursePassed,
      passingRate: pct(coursePassed, courseExamined),
    };
  }));

  // --- Item analysis (same scope as the page: school year/exam/subject for the
  // question set, school year + campus for the responses that are counted) ---
  const questions = await prisma.tbl_exam_question.findMany({
    where: {
      ...(examId ? { exam_id: examId } : cycle ? { tbl_exam: { cycle_id: cycle.cycle_id } } : {}),
      ...(subject ? { tbl_competency: { subject_area: subject } } : {}),
    },
    orderBy: { question_no: "asc" },
    select: { question_id: true, question_no: true, tbl_competency: { select: { competency_name: true, subject_area: true } } },
  });
  const items = await Promise.all(questions.map(async (question) => {
    const responses = await prisma.tbl_question_response.findMany({
      where: { question_id: question.question_id, tbl_exam_result: { tbl_application: base } },
      select: { is_correct: true },
    });
    const correct = responses.filter((response) => response.is_correct).length;
    return {
      question: `Q${question.question_no}`,
      competency: question.tbl_competency?.competency_name ?? "General",
      subject: question.tbl_competency?.subject_area ?? "—",
      responses: responses.length,
      correct,
      correctRate: pct(correct, responses.length),
    };
  }));

  // --- By competency (summary) ---
  const competencyTotals = new Map<string, { correct: number; responses: number; questions: number }>();
  for (const item of items) {
    const total = competencyTotals.get(item.competency) ?? { correct: 0, responses: 0, questions: 0 };
    total.correct += item.correct;
    total.responses += item.responses;
    total.questions += 1;
    competencyTotals.set(item.competency, total);
  }
  const byCompetency = [...competencyTotals.entries()]
    .map(([competency, total]) => ({
      competency,
      questions: total.questions,
      correctRate: pct(total.correct, total.responses),
    }))
    .sort((a, b) => a.correctRate - b.correctRate);

  // Compact item-analysis view: a summary plus the five hardest and easiest
  // items — no need to list every question in the report.
  const answered = items.filter((item) => item.responses > 0);
  const byDifficulty = answered.slice().sort((a, b) => a.correctRate - b.correctRate);
  const avgCorrectRate = answered.length
    ? Math.round((answered.reduce((sum, item) => sum + item.correctRate, 0) / answered.length) * 10) / 10
    : 0;
  const belowHalf = answered.filter((item) => item.correctRate < 50).length;
  const hardestItem = byDifficulty[0];
  const easiestItem = byDifficulty[byDifficulty.length - 1];
  const extremes = [
    ...byDifficulty.slice(0, 5).map((item) => ({ group: "Hardest", ...item })),
    ...byDifficulty.slice().reverse().slice(0, 5).map((item) => ({ group: "Easiest", ...item })),
  ];

  const date = new Date().toISOString().slice(0, 10);
  return reportResponse({
    title: "Item Analysis Report",
    meta: [
      `School year: ${cycle?.school_year ?? "All"}`,
      `Campus: ${campus?.branch_name ?? "All campuses"}`,
      `Exam: ${exam?.exam_name ?? "All exams"}`,
      `Subject: ${subject ?? "All subjects"}`,
      `Generated ${date}`,
    ],
    tables: [
      {
        title: "Overall result",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", align: "right" },
        ],
        rows: [
          { metric: "Examinees", value: examined },
          { metric: "Passed", value: passed },
          { metric: "Failed", value: examined - passed },
          { metric: "Passing rate (%)", value: pct(passed, examined) },
        ],
      },
      {
        title: "Passing rate by course",
        columns: [
          { key: "code", label: "Course code" },
          { key: "name", label: "Course" },
          { key: "examined", label: "Examinees", align: "right" },
          { key: "passed", label: "Passed", align: "right" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
        ],
        rows: courses,
      },
      {
        title: "Item analysis summary",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", align: "right" },
        ],
        rows: [
          { metric: "Questions analyzed", value: `${answered.length} of ${items.length}` },
          { metric: "Average correct rate (%)", value: avgCorrectRate },
          { metric: "Items below 50% correct", value: belowHalf },
          { metric: "Hardest item", value: hardestItem ? `${hardestItem.question} (${hardestItem.correctRate}%)` : "—" },
          { metric: "Easiest item", value: easiestItem ? `${easiestItem.question} (${easiestItem.correctRate}%)` : "—" },
        ],
      },
      {
        title: "Hardest and easiest items",
        columns: [
          { key: "group", label: "Group" },
          { key: "question", label: "Question" },
          { key: "competency", label: "Competency" },
          { key: "responses", label: "Responses", align: "right" },
          { key: "correctRate", label: "Correct rate (%)", align: "right" },
        ],
        rows: extremes,
      },
      {
        title: "Item analysis by competency",
        columns: [
          { key: "competency", label: "Competency" },
          { key: "questions", label: "Questions", align: "right" },
          { key: "correctRate", label: "Avg correct rate (%)", align: "right" },
        ],
        rows: byCompetency,
      },
    ],
    fileBase: `item-analysis-${date}`,
  }, parseExportFormat(params.get("format"), "xlsx"));
}
