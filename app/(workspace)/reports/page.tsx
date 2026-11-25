import { BadgeCheck, ChartColumn, ClipboardCheck, Users } from "lucide-react";
import { connection } from "next/server";

import {
  AnalyticsCard,
  AnalyticsPage,
  CHART_COLORS,
  ChartLegend,
  EmptyChart,
  FilterBar,
  MeterList,
  SegmentedBar,
  SelectFilter,
  StackedColumns,
  StatTile,
  TrendChart,
} from "@/components/reports/analytics-ui";
import { resolveCycle } from "@/features/admission/admission-stats";
import { getOverview, pct } from "@/features/reports/overview";
import {
  distributionInsight,
  pipelineInsight,
  resultsInsight,
  subjectInsight,
  trendInsight,
} from "@/features/reports/overview-insights";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const fmt = (value: number) => value.toLocaleString("en-US");
/** Every percentage on the page uses one decimal. */
const percent = (value: number) => `${value.toFixed(1)}%`;

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string; campus?: string; course?: string }> }>;

export default async function ReportsPage({ searchParams }: PageProps) {
  await connection();
  await requirePermission("reports", "read");

  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);
  const campusId = params.campus && params.campus !== "all" ? Number(params.campus) : null;
  const courseId = params.course && params.course !== "all" ? Number(params.course) : null;

  const [campuses, programs, data] = await Promise.all([
    prisma.tbl_branch.findMany({ orderBy: { branch_name: "asc" }, select: { branch_id: true, branch_name: true } }),
    prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true } }),
    getOverview({ cycleId: cycle?.cycle_id ?? null, campusId, courseId }),
  ]);

  const exportHref = `/api/reports/overview?cycle=${cycle?.cycle_id ?? ""}${campusId ? `&campus=${campusId}` : ""}${courseId ? `&course=${courseId}` : ""}`;
  const change = (value: { value: number; against: string } | null) => (value ? { ...value, unit: " pts" } : null);
  const ofApplicants = (count: number) => percent(pct(count, data.applicants));

  return (
    <AnalyticsPage>
      <FilterBar action="/reports" exportHref={exportHref}>
        <SelectFilter
          name="cycle"
          label="School Year"
          value={cycle ? String(cycle.cycle_id) : ""}
          options={cycles.map((c) => ({ value: String(c.cycle_id), label: c.school_year }))}
        />
        <SelectFilter
          name="campus"
          label="Campus"
          value={campusId ? String(campusId) : "all"}
          options={[{ value: "all", label: "All" }, ...campuses.map((c) => ({ value: String(c.branch_id), label: c.branch_name }))]}
        />
        <SelectFilter
          name="course"
          label="Course"
          value={courseId ? String(courseId) : "all"}
          options={[{ value: "all", label: "All" }, ...programs.map((p) => ({ value: String(p.program_id), label: p.program_code }))]}
        />
      </FilterBar>

      {/* Headline numbers */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Applicants"
          icon={<Users />}
          value={fmt(data.applicants)}
          note={cycle ? `School year ${cycle.school_year}` : undefined}
        />
        <StatTile
          label="Examinees"
          icon={<ClipboardCheck />}
          value={fmt(data.examinees)}
          note={`${ofApplicants(data.examinees)} of applicants`}
        />
        <StatTile
          label="Passing rate"
          icon={<BadgeCheck />}
          value={percent(data.passingRate)}
          delta={change(data.passingRateChange)}
          note={`${fmt(data.passed)} of ${fmt(data.examinees)} passed`}
        />
        <StatTile
          label="Average score"
          icon={<ChartColumn />}
          value={data.average.toFixed(1)}
          delta={change(data.averageChange)}
          note="out of 100"
        />
      </div>

      {/* Where applicants are in the process */}
      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <AnalyticsCard
          className="lg:col-span-3"
          title="Admission pipeline"
          insight={pipelineInsight(data)}
          description={`How far the ${fmt(data.applicants)} applicant${data.applicants === 1 ? "" : "s"} got; each bar is a share of all applicants`}
        >
          {data.applicants === 0 ? (
            <EmptyChart>No applicants for these filters.</EmptyChart>
          ) : (
            <MeterList
              fill
              max={data.applicants}
              rows={[
                {
                  label: "Took the exam",
                  value: data.examinees,
                  figure: fmt(data.examinees),
                  note: ofApplicants(data.examinees),
                  detail:
                    data.applicants > data.examinees
                      ? `${fmt(data.applicants - data.examinees)} of ${fmt(data.applicants)} applicants have not taken it yet`
                      : "Every applicant has taken the exam",
                },
                {
                  label: "Passed the exam",
                  value: data.passed,
                  figure: fmt(data.passed),
                  note: ofApplicants(data.passed),
                  detail: data.examinees ? `${percent(pct(data.passed, data.examinees))} of examinees passed` : "No examinees yet",
                },
                {
                  label: "Enrolled",
                  value: data.enrolled,
                  figure: fmt(data.enrolled),
                  note: ofApplicants(data.enrolled),
                  detail: data.passed ? `${percent(pct(data.enrolled, data.passed))} of passers enrolled` : "No passers yet",
                },
              ]}
            />
          )}
        </AnalyticsCard>
        <AnalyticsCard
          className="lg:col-span-2"
          title="Exam results"
          description="Every examinee, by outcome"
          insight={resultsInsight(data)}
        >
          <SegmentedBar
            unit="examinees"
            parts={[
              { label: "Passed, admitted", value: data.admitted, color: CHART_COLORS.passed },
              { label: "Passed, waitlisted", value: data.waitlisted, color: CHART_COLORS.waitlisted },
              { label: "Failed", value: data.failed, color: CHART_COLORS.failed },
            ]}
          />
        </AnalyticsCard>
      </div>

      {/* How the scores are spread */}
      <AnalyticsCard
        className="mb-4"
        title="Score distribution"
        description="Examinees per score range"
        insight={distributionInsight(data)}
      >
        {data.examinees === 0 ? (
          <EmptyChart>No exam scores for these filters.</EmptyChart>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
            <div>
              <div className="mb-3">
                <ChartLegend
                  items={[
                    { label: "Passed", color: CHART_COLORS.passed },
                    { label: "Failed", color: CHART_COLORS.failed },
                  ]}
                />
              </div>
              <StackedColumns
                bins={data.bins}
                xLabel="Exam score (%)"
                series={[
                  { key: "failed", label: "Failed", color: CHART_COLORS.failed },
                  { key: "passed", label: "Passed", color: CHART_COLORS.passed },
                ]}
              />
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-5 lg:grid-cols-1 lg:content-start lg:gap-0 lg:divide-y lg:divide-neutral-100">
              {(
                [
                  ["Mean", data.stats.mean],
                  ["Median", data.stats.median],
                  ["Std. deviation", data.stats.deviation],
                  ["Lowest", data.stats.lowest],
                  ["Highest", data.stats.highest],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:py-2.5">
                  <dt className="text-xs text-neutral-500 lg:text-sm">{label}</dt>
                  <dd className="font-semibold text-neutral-900 tabular-nums">{value.toFixed(1)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </AnalyticsCard>

      {/* Compared with earlier years, and by subject */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard
          title="Year over year"
          description={`Last ${data.yearly.length} school year${data.yearly.length === 1 ? "" : "s"}, same campus and course filters`}
          insight={trendInsight(data)}
        >
          <div className="mb-3">
            <ChartLegend
              items={[
                { label: "Passing rate (%)", color: CHART_COLORS.passed },
                { label: "Average score (of 100)", color: CHART_COLORS.secondary },
              ]}
            />
          </div>
          <TrendChart
            labels={data.yearly.map((y) => y.label)}
            series={[
              { label: "Passing rate", color: CHART_COLORS.passed, values: data.yearly.map((y) => y.passingRate), format: percent },
              { label: "Average score", color: CHART_COLORS.secondary, values: data.yearly.map((y) => y.average), format: (v) => v.toFixed(1) },
            ]}
          />
        </AnalyticsCard>
        <AnalyticsCard
          title="Average score by subject"
          description="Share of points earned per subject"
          insight={subjectInsight(data)}
        >
          {data.subjects.length === 0 ? (
            <EmptyChart>No per-question answers yet. They come from scanned answer sheets.</EmptyChart>
          ) : (
            <MeterList fill max={100} rows={data.subjects.map((s) => ({ label: s.label, value: s.value, figure: percent(s.value) }))} />
          )}
        </AnalyticsCard>
      </div>
    </AnalyticsPage>
  );
}
