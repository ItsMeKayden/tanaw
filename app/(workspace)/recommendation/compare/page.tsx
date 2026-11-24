import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { tableStyles } from "@/components/ui/table-styles";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { CourseMatchList, ScoreVsRequirementChart } from "@/components/recommendation/charts";
import { ProfileRadar } from "@/components/recommendation/profile-radar";
import { ParamSelect } from "@/components/recommendation/controls";
import { PendingArea, PendingLink, PendingProvider } from "@/components/ui/pending-navigation";
import { shortCompetencyName } from "@/features/recommendation/config";
import { resolveSelection } from "@/features/recommendation/selection";
import { requirePermission } from "@/lib/authorization";
import { ChartPageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ application?: string; program?: string; cycle?: string }>;
}>;

const cell = tableStyles.td;

async function CompareContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("recommendation", "read");

  const { data, applicants, programs, program } = await resolveSelection(await searchParams, "recommended");

  if (!data || !program) {
    return (
      <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
        <QcuWatermark />
        <h1 className="text-2xl font-bold">Course Comparison</h1>
        <p className="rounded-xl border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No applicant has a generated recommendation yet.{" "}
          <Link href="/recommendation" className="text-[#191e73] underline">
            Go to Recommendations
          </Link>
          .
        </p>
      </div>
    );
  }

  // Per-subject breakdown vs the course's compatibility rule (minimum score).
  const rows = data.competencyScores.map((competency) => {
    const link = program.weights.find((w) => w.competency_id === competency.competency_id);
    const weight = link?.weight ?? 0;
    const required = link?.min_score ?? null;
    let result = weight > 0 ? "No minimum" : "Not weighted";
    if (required !== null) {
      if (competency.percent === null) result = "No answers";
      else result = competency.percent >= required ? "Meets" : "Below";
    }
    return {
      label: shortCompetencyName(competency.competency_name),
      name: competency.competency_name,
      weight,
      score: competency.percent,
      required,
      result,
    };
  });

  const radarRows = data.competencyScores.map((competency) => ({
    label: shortCompetencyName(competency.competency_name),
    score: competency.percent === null ? null : Math.round(competency.percent),
    required: program.weights.find((w) => w.competency_id === competency.competency_id)?.min_score ?? null,
  }));

  // Quick-compare pills: the applicant's choices plus the top recommendation.
  const pillIds = Array.from(
    new Set([...data.choices.map((c) => c.program_id), ...(data.ranking[0] ? [data.ranking[0].program_id] : [])]),
  );
  const pills = pillIds
    .map((id) => data.programs.find((p) => p.program_id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const match = data.ranking.find((r) => r.program_id === program.program_id)?.match ?? null;
  const base = `/recommendation/compare?application=${data.application_id}`;
  const hrefs = Object.fromEntries(data.ranking.map((r) => [r.program_id, `${base}&program=${r.program_id}`]));

  return (
    <PendingProvider>
      <div className="relative isolate min-h-full space-y-3 p-3 sm:p-4">
        <QcuWatermark />
        <div>
          <h1 className="text-2xl font-bold">Course Comparison</h1>
          <p className="text-sm text-neutral-700">
            The applicant&apos;s subject scores and profile against each course&apos;s compatibility rules
            (minimum score per subject, set in Mapping Settings). Advisory only: it doesn&apos;t change the
            admission stage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ParamSelect
            param="application"
            label="Applicant"
            value={String(data.application_id)}
            options={applicants.map((a) => ({ value: String(a.application_id), label: a.label }))}
            resetParams={["program"]}
          />
          <ParamSelect
            param="program"
            label="Course"
            value={String(program.program_id)}
            options={programs.map((p) => ({
              value: String(p.program_id),
              label: `${p.program_code}${p.program_id === data.preferred?.program_id ? " (preferred)" : ""}`,
            }))}
          />
          <Link
            href={`/recommendation/${data.application_id}`}
            className="self-center text-sm text-[#191e73] hover:underline"
          >
            View recommendation →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-800">Compare with:</span>
          {pills.map((p) => {
            const active = p.program_id === program.program_id;
            return (
              <PendingLink
                key={p.program_id}
                href={`${base}&program=${p.program_id}`}
                aria-current={active ? "true" : undefined}
                title={p.program_name}
                className={`rounded-full border px-4 py-1 text-sm transition-colors ${
                  active
                    ? "border-[#191e73] bg-[#191e73] font-medium text-white"
                    : "border-neutral-500 bg-white text-neutral-900 hover:bg-neutral-100"
                }`}
              >
                {p.program_name.replace(/^Bachelor of Science in /, "BS ")}
              </PendingLink>
            );
          })}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Top-left: applicant score; the breakdown table opens downward. */}
          <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
            <h2 className="mb-3 font-semibold">
              Applicant score vs. {program.program_code} requirement (%)
            </h2>
            <PendingArea>
              <ScoreVsRequirementChart rows={rows} />
            </PendingArea>
            <p className="mt-3 text-sm text-neutral-700">
              {program.program_code} match: <span className="font-semibold">{match ?? "--"}%</span>
            </p>
            <div className={`${tableStyles.wrap} mt-3`}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={tableStyles.headRow}>
                    {["Competency", "Weight", "Score", "Req.", "Result"].map((h) => (
                      <th key={h} className={tableStyles.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={tableStyles.body}>
                  {rows.map((row) => (
                    <tr key={row.name} className={tableStyles.row}>
                      <td className={cell}>{row.name}</td>
                      <td className={`${cell} tabular-nums`}>{row.weight}%</td>
                      <td className={`${cell} tabular-nums`}>{row.score === null ? "--" : `${row.score}%`}</td>
                      <td className={`${cell} tabular-nums`}>{row.required === null ? "--" : `${row.required}%`}</td>
                      <td className={cell}>
                        <span
                          className={
                            row.result === "Meets"
                              ? "font-medium text-green-700"
                              : row.result === "Below"
                                ? "font-medium text-red-700"
                                : "text-neutral-500"
                          }
                        >
                          {row.result === "Meets" ? "✓ " : row.result === "Below" ? "✕ " : ""}
                          {row.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top-right: the profile radar. */}
          <section className="rounded-xl border border-[#9fa3e0] bg-[#e3e4f8]/85 p-4">
            <h2 className="font-semibold">Profile comparison</h2>
            <p className="text-sm text-neutral-700">
              {data.full_name} vs {program.program_name}
              {match !== null && (
                <>
                  {" "}
                  · <span className="font-medium text-black tabular-nums">{match}% match</span>
                </>
              )}
            </p>
            <PendingArea className="mt-3 rounded-xl border border-neutral-500 bg-white p-4">
              <ProfileRadar rows={radarRows} courseLabel={program.program_code} />
            </PendingArea>
          </section>

          {/* Bottom (full width): the course ranking. */}
          <section className="rounded-xl border border-neutral-500 bg-white/95 p-4 lg:col-span-2">
            <h2 className="mb-3 font-semibold">Match per course (%)</h2>
            <PendingArea>
              <CourseMatchList
                ranking={data.ranking}
                selectedId={program.program_id}
                preferredId={data.preferred?.program_id}
                hrefs={hrefs}
              />
            </PendingArea>
            <p className="mt-3 text-xs text-neutral-600">
              Courses whose subject minimums are met come first, each by match. Select a course to compare.
            </p>
          </section>
        </div>
      </div>
    </PendingProvider>
  );
}

export default function ComparePage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<ChartPageSkeleton label="course comparison" radar />}>
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}
