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
  const base = {
    ...(cycle ? { cycle_id: cycle.cycle_id } : {}),
    ...(campusId ? { branch_id: campusId } : {}),
  };

  const [examined, passed, campus, programs] = await Promise.all([
    prisma.tbl_exam_result.count({ where: { tbl_application: base } }),
    prisma.tbl_exam_result.count({ where: { tbl_application: base, result_status: EXAM_RESULT_PASSED } }),
    campusId ? prisma.tbl_branch.findUnique({ where: { branch_id: campusId }, select: { branch_name: true } }) : null,
    prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true, program_name: true } }),
  ]);

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

  const date = new Date().toISOString().slice(0, 10);
  return reportResponse({
    title: "Passing Rate Report",
    meta: [
      `School year: ${cycle?.school_year ?? "All"}`,
      `Campus: ${campus?.branch_name ?? "All campuses"}`,
      `Reference passing score: 50`,
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
    ],
    fileBase: `passing-rate-${date}`,
  }, parseExportFormat(params.get("format"), "xlsx"));
}
