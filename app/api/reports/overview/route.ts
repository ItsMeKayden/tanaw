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

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasPermission(session.user.role, "reports", "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { cycles, cycle } = await resolveCycle(params.get("cycle") ?? undefined);
  const campusId = Number(params.get("campus") ?? 0) || null;
  const courseId = Number(params.get("course") ?? 0) || null;
  const where = {
    ...(cycle ? { cycle_id: cycle.cycle_id } : {}),
    ...(campusId ? { branch_id: campusId } : {}),
    ...(courseId ? { program_id: courseId } : {}),
  };

  const [applications, results, campuses, programs] = await Promise.all([
    prisma.tbl_application.findMany({ where, select: { application_id: true } }),
    prisma.tbl_exam_result.findMany({
      where: { tbl_application: where },
      select: { percentage: true, result_status: true },
    }),
    prisma.tbl_branch.findMany({ select: { branch_id: true, branch_name: true } }),
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true } }),
  ]);

  const passed = results.filter((r) => r.result_status === EXAM_RESULT_PASSED).length;
  const examined = results.length;
  const scores = results.map((r) => num(r.percentage));
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
  const highest = scores.length ? Math.max(...scores) : 0;

  const publicApplications = await prisma.tbl_application.count({
    where: { ...where, tbl_school: { school_type: "Public" } },
  });
  const privateApplications = await prisma.tbl_application.count({
    where: { ...where, tbl_school: { school_type: "Private" } },
  });

  const [publicExamined, publicPassed, privateExamined, privatePassed] = await Promise.all([
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Public" }, tbl_exam_result: { some: {} } } }),
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Public" }, tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } } } }),
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Private" }, tbl_exam_result: { some: {} } } }),
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Private" }, tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } } } }),
  ]);

  const trend = await Promise.all(cycles.slice(-5).map(async (item) => {
    const cycleResults = await prisma.tbl_exam_result.findMany({
      where: { tbl_application: {
        cycle_id: item.cycle_id,
        ...(campusId ? { branch_id: campusId } : {}),
        ...(courseId ? { program_id: courseId } : {}),
      } },
      select: { result_status: true },
    });
    const cyclePassed = cycleResults.filter((r) => r.result_status === EXAM_RESULT_PASSED).length;
    return { cycle: item.school_year, examined: cycleResults.length, passed: cyclePassed, passingRate: pct(cyclePassed, cycleResults.length) };
  }));

  const campusName = campusId ? campuses.find((c) => c.branch_id === campusId)?.branch_name : "All campuses";
  const courseName = courseId ? programs.find((p) => p.program_id === courseId)?.program_code : "All courses";
  const date = new Date().toISOString().slice(0, 10);

  return reportResponse({
    title: "Reports Overview",
    meta: [
      `School year: ${cycle?.school_year ?? "All"}`,
      `Campus: ${campusName ?? "All campuses"}`,
      `Course: ${courseName ?? "All courses"}`,
      `Generated ${date}`,
    ],
    tables: [
      {
        title: "Summary",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", align: "right" },
        ],
        rows: [
          { metric: "Applicants", value: applications.length },
          { metric: "Examinees", value: examined },
          { metric: "Passed", value: passed },
          { metric: "Passing rate (%)", value: pct(passed, examined) },
          { metric: "Average score", value: average.toFixed(1) },
          { metric: "Highest score", value: highest.toFixed(1) },
        ],
      },
      {
        title: "Public vs private",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "public", label: "Public", align: "right" },
          { key: "private", label: "Private", align: "right" },
        ],
        rows: [
          { metric: "Applicants", public: publicApplications, private: privateApplications },
          { metric: "Took exam", public: publicExamined, private: privateExamined },
          { metric: "Passed", public: publicPassed, private: privatePassed },
          { metric: "Passing rate (%)", public: pct(publicPassed, publicExamined), private: pct(privatePassed, privateExamined) },
        ],
      },
      {
        title: "Passing rate by year",
        columns: [
          { key: "cycle", label: "School year" },
          { key: "examined", label: "Examinees", align: "right" },
          { key: "passed", label: "Passed", align: "right" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
        ],
        rows: trend,
      },
    ],
    fileBase: `reports-overview-${date}`,
  }, parseExportFormat(params.get("format"), "xlsx"));
}
