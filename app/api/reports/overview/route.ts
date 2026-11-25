import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { resolveCycle } from "@/features/admission/admission-stats";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { getOverview } from "@/features/reports/overview";
import { parseExportFormat, reportResponse } from "@/features/reports/report";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasPermission(session.user.role, "reports", "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { cycle } = await resolveCycle(params.get("cycle") ?? undefined);
  const campusId = Number(params.get("campus") ?? 0) || null;
  const courseId = Number(params.get("course") ?? 0) || null;
  // Archived applicants are left out, as on the Overview page.
  const where = {
    ...ACTIVE_APPLICATION,
    ...(cycle ? { cycle_id: cycle.cycle_id } : {}),
    ...(campusId ? { branch_id: campusId } : {}),
    ...(courseId ? { program_id: courseId } : {}),
  };

  // Same figures as the Overview page.
  const [data, campuses, programs] = await Promise.all([
    getOverview({ cycleId: cycle?.cycle_id ?? null, campusId, courseId }),
    prisma.tbl_branch.findMany({ select: { branch_id: true, branch_name: true } }),
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true } }),
  ]);

  const byType = (school_type: string) => ({ ...where, tbl_school: { school_type } });
  const [publicApplications, privateApplications, publicExamined, publicPassed, privateExamined, privatePassed] =
    await Promise.all([
      prisma.tbl_application.count({ where: byType("Public") }),
      prisma.tbl_application.count({ where: byType("Private") }),
      prisma.tbl_application.count({ where: { ...byType("Public"), tbl_exam_result: { some: {} } } }),
      prisma.tbl_application.count({ where: { ...byType("Public"), tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } } } }),
      prisma.tbl_application.count({ where: { ...byType("Private"), tbl_exam_result: { some: {} } } }),
      prisma.tbl_application.count({ where: { ...byType("Private"), tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } } } }),
    ]);

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
          { metric: "Applicants", value: data.applicants },
          { metric: "Examinees", value: data.examinees },
          { metric: "Passed", value: data.passed },
          { metric: "Passed, waitlisted", value: data.waitlisted },
          { metric: "Failed", value: data.failed },
          { metric: "Enrolled", value: data.enrolled },
          { metric: "Passing rate (%)", value: round1(data.passingRate) },
          { metric: "Average score", value: data.average.toFixed(1) },
          { metric: "Median score", value: data.stats.median.toFixed(1) },
          { metric: "Lowest score", value: data.stats.lowest.toFixed(1) },
          { metric: "Highest score", value: data.stats.highest.toFixed(1) },
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
        title: "Year over year",
        columns: [
          { key: "cycle", label: "School year" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
          { key: "average", label: "Average score", align: "right" },
        ],
        rows: data.yearly.map((year) => ({
          cycle: year.label,
          passingRate: year.passingRate === null ? "—" : round1(year.passingRate),
          average: year.average === null ? "—" : year.average.toFixed(1),
        })),
      },
    ],
    fileBase: `reports-overview-${date}`,
  }, parseExportFormat(params.get("format"), "xlsx"));
}
