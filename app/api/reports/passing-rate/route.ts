import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { resolveCycle } from "@/features/admission/admission-stats";
import { parseExportFormat, reportResponse } from "@/features/reports/report";
import { getSchoolsReport, parseSchoolType } from "@/features/reports/schools";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Export of Analytics → Schools & Passing Rate (same figures as the page). */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasPermission(session.user.role, "reports", "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { cycle } = await resolveCycle(params.get("cycle") ?? undefined);
  const campusId = Number(params.get("campus") ?? 0) || null;
  const type = parseSchoolType(params.get("type"));

  const [data, campus] = await Promise.all([
    getSchoolsReport({ cycleId: cycle?.cycle_id ?? null, campusId, type }),
    campusId ? prisma.tbl_branch.findUnique({ where: { branch_id: campusId }, select: { branch_name: true } }) : null,
  ]);

  const rule = data.passingRule;
  const date = new Date().toISOString().slice(0, 10);
  return reportResponse({
    title: "Schools & Passing Rate Report",
    meta: [
      `School year: ${cycle?.school_year ?? "All"}`,
      `Campus: ${campus?.branch_name ?? "All campuses"}`,
      `School type: ${type ?? "All"}`,
      `Passing score: ${rule ? (rule.byPoints ? `${rule.value} points` : `${rule.value}%`) : "not set"}`,
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
          { metric: "Schools", value: data.schoolCount },
          { metric: "Applicants", value: data.applicants },
          { metric: "Examinees", value: data.examinees },
          { metric: "Passed", value: data.passed },
          { metric: "Passed, waitlisted", value: data.waitlisted },
          { metric: "Failed", value: data.failed },
          { metric: "Passing rate (%)", value: round1(data.passingRate) },
          { metric: "Average score", value: data.average.toFixed(1) },
        ],
      },
      {
        title: "Passing rate by course",
        columns: [
          { key: "code", label: "Course code" },
          { key: "name", label: "Course" },
          { key: "examinees", label: "Examinees", align: "right" },
          { key: "passed", label: "Passed", align: "right" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
        ],
        rows: data.courses.map((c) => ({ ...c, passingRate: round1(c.passingRate) })),
      },
      {
        title: "Public vs private (all school types)",
        columns: [
          { key: "type", label: "School type" },
          { key: "applicants", label: "Applicants", align: "right" },
          { key: "examinees", label: "Took exam", align: "right" },
          { key: "passed", label: "Passed", align: "right" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
          { key: "average", label: "Average score", align: "right" },
        ],
        rows: data.types.map((t) => ({
          ...t,
          passingRate: round1(t.passingRate),
          average: t.examinees ? t.average.toFixed(1) : "—",
        })),
      },
      {
        title: "Schools",
        columns: [
          { key: "name", label: "School" },
          { key: "type", label: "Type" },
          { key: "applicants", label: "Applicants", align: "right" },
          { key: "examinees", label: "Examinees", align: "right" },
          { key: "passed", label: "Passed", align: "right" },
          { key: "passingRate", label: "Passing rate (%)", align: "right" },
        ],
        rows: data.schools
          .slice()
          .sort((a, b) => b.applicants - a.applicants || a.name.localeCompare(b.name))
          .map((s) => ({ ...s, type: s.type ?? "—", passingRate: s.examinees ? round1(s.passingRate) : "—" })),
      },
    ],
    fileBase: `schools-passing-rate-${date}`,
  }, parseExportFormat(params.get("format"), "xlsx"));
}
