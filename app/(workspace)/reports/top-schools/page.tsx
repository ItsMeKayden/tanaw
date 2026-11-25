import { BadgeCheck, ChartColumn, ClipboardCheck, School } from "lucide-react";
import { connection } from "next/server";

import {
  AnalyticsCard,
  AnalyticsPage,
  CHART_COLORS,
  EmptyChart,
  FilterBar,
  MeterList,
  RankTable,
  SegmentedBar,
  SegmentedLinks,
  SelectFilter,
  StatTile,
} from "@/components/reports/analytics-ui";
import { resolveCycle } from "@/features/admission/admission-stats";
import { getSchoolsReport, parseSchoolType, RANK_SIZE } from "@/features/reports/schools";
import {
  applicantsInsight,
  courseInsight,
  overallInsight,
  passersInsight,
  typeInsight,
} from "@/features/reports/schools-insights";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const fmt = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${value.toFixed(1)}%`;

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string; campus?: string; type?: string }> }>;

/** Analytics → Schools & Passing Rate: pass rates overall, by course and by school type, and the school rankings. */
export default async function SchoolsPage({ searchParams }: PageProps) {
  await connection();
  await requirePermission("reports", "read");

  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);
  const campusId = params.campus && params.campus !== "all" ? Number(params.campus) : null;
  const type = parseSchoolType(params.type);

  const [campuses, data] = await Promise.all([
    prisma.tbl_branch.findMany({ orderBy: { branch_name: "asc" }, select: { branch_id: true, branch_name: true } }),
    getSchoolsReport({ cycleId: cycle?.cycle_id ?? null, campusId, type }),
  ]);

  const query = (next: { type?: string | null }) => {
    const search = new URLSearchParams();
    if (cycle) search.set("cycle", String(cycle.cycle_id));
    if (campusId) search.set("campus", String(campusId));
    const nextType = "type" in next ? next.type : type;
    if (nextType) search.set("type", nextType);
    return search.toString();
  };
  const scopeLabel = type ? `${type.toLowerCase()}-school ` : "";

  return (
    <AnalyticsPage>
      <FilterBar action="/reports/top-schools" exportHref={`/api/reports/passing-rate?${query({})}`}>
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
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <SegmentedLinks
          label="School type"
          options={[
            { label: "All schools", href: `/reports/top-schools?${query({ type: null })}`, active: !type },
            { label: "Public", href: `/reports/top-schools?${query({ type: "Public" })}`, active: type === "Public" },
            { label: "Private", href: `/reports/top-schools?${query({ type: "Private" })}`, active: type === "Private" },
          ]}
        />
      </FilterBar>

      {/* Headline numbers */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Schools" icon={<School />} value={fmt(data.schoolCount)} note={`sending ${fmt(data.applicants)} applicants`} />
        <StatTile
          label="Examinees"
          icon={<ClipboardCheck />}
          value={fmt(data.examinees)}
          note={`${percent(data.applicants ? (data.examinees / data.applicants) * 100 : 0)} of applicants`}
        />
        <StatTile
          label="Passing rate"
          icon={<BadgeCheck />}
          value={percent(data.passingRate)}
          note={
            data.passingRule
              ? `passing score ${data.passingRule.byPoints ? `${data.passingRule.value} pts` : `${data.passingRule.value}%`}`
              : "no passing score set"
          }
        />
        <StatTile label="Average score" icon={<ChartColumn />} value={data.average.toFixed(1)} note="out of 100" />
      </div>

      {/* Pass rates: overall and by course */}
      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <AnalyticsCard
          className="lg:col-span-2"
          title="Overall result"
          description={`Every ${scopeLabel}examinee, by outcome`}
          insight={overallInsight(data)}
        >
          <div className="flex flex-1 flex-col justify-between gap-5">
            <SegmentedBar
              unit="examinees"
              parts={[
                { label: "Passed, admitted", value: data.admitted, color: CHART_COLORS.passed },
                { label: "Passed, waitlisted", value: data.waitlisted, color: CHART_COLORS.waitlisted },
                { label: "Failed", value: data.failed, color: CHART_COLORS.failed },
              ]}
            />
            {data.examinees > 0 ? (
              <dl className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Passing score",
                    value: data.passingRule
                      ? data.passingRule.byPoints
                        ? `${data.passingRule.value} pts`
                        : `${data.passingRule.value}%`
                      : "Not set",
                  },
                  { label: "Median score", value: data.median === null ? "—" : `${data.median.toFixed(1)}%` },
                  { label: "Highest score", value: data.highest === null ? "—" : `${data.highest.toFixed(1)}%` },
                  { label: "Lowest score", value: data.lowest === null ? "—" : `${data.lowest.toFixed(1)}%` },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-neutral-50 px-3 py-2.5">
                    <dt className="text-xs text-neutral-500">{stat.label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-neutral-900 tabular-nums">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </AnalyticsCard>
        <AnalyticsCard
          className="lg:col-span-3"
          title="Passing rate by course"
          description="Share of each course's examinees who passed, highest first"
          insight={courseInsight(data)}
        >
          {data.courses.length === 0 ? (
            <EmptyChart>No exam results for these filters.</EmptyChart>
          ) : (
            <MeterList
              fill
              max={100}
              rows={data.courses.map((course) => ({
                label: course.code,
                sublabel: course.name,
                value: course.passingRate,
                figure: percent(course.passingRate),
                note: `${fmt(course.passed)} of ${fmt(course.examinees)}`,
              }))}
            />
          )}
        </AnalyticsCard>
      </div>

      {/* Public vs private (always both types) */}
      <AnalyticsCard
        className="mb-4"
        title="Public vs private schools"
        description="Both school types side by side; not affected by the school type filter"
        insight={typeInsight(data)}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <MeterList
            fill
            max={100}
            color={CHART_COLORS.passed}
            rows={data.types.map((t) => ({
              label: `${t.type} schools`,
              value: t.passingRate,
              figure: t.examinees ? percent(t.passingRate) : "—",
              note: "pass rate",
              detail: `${fmt(t.passed)} of ${fmt(t.examinees)} examinees passed`,
            }))}
          />
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="px-1 pb-2 font-medium">Metric</th>
                  {data.types.map((t) => (
                    <th key={t.type} className="w-24 px-1 pb-2 text-right font-medium">{t.type}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(
                  [
                    ["Applicants", (t) => fmt(t.applicants)],
                    ["Took the exam", (t) => fmt(t.examinees)],
                    ["Passed", (t) => fmt(t.passed)],
                    ["Average score", (t) => (t.examinees ? t.average.toFixed(1) : "—")],
                  ] as const satisfies readonly (readonly [string, (t: (typeof data.types)[number]) => string])[]
                ).map(([label, value]) => (
                  <tr key={label}>
                    <td className="px-1 py-2 text-neutral-700">{label}</td>
                    {data.types.map((t) => (
                      <td key={t.type} className="px-1 py-2 text-right font-semibold text-neutral-900 tabular-nums">{value(t)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnalyticsCard>

      {/* School rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard
          title="Most applicants"
          description={`Top ${RANK_SIZE} ${scopeLabel}schools by number of applicants`}
          insight={applicantsInsight(data)}
        >
          <RankTable
            unit="Applicants"
            empty="No applicants for these filters."
            rows={data.mostApplicants.map((s) => ({ ...s, value: s.applicants }))}
          />
        </AnalyticsCard>
        <AnalyticsCard
          title="Most passers"
          description={`Top ${RANK_SIZE} ${scopeLabel}schools by number of examinees who passed`}
          insight={passersInsight(data)}
        >
          <RankTable
            unit="Passed"
            empty="No passers for these filters yet."
            rows={data.mostPassers.map((s) => ({ ...s, value: s.passed }))}
          />
        </AnalyticsCard>
      </div>
    </AnalyticsPage>
  );
}
