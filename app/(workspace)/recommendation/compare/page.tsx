import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { CourseMatchList } from "@/components/recommendation/charts";
import { ProfileRadar } from "@/components/recommendation/profile-radar";
import { PendingArea, PendingLink, PendingProvider } from "@/components/ui/pending-navigation";
import { ParamSelect } from "@/components/recommendation/controls";
import { shortCompetencyName } from "@/features/recommendation/config";
import { resolveSelection } from "@/features/recommendation/selection";
import { requirePermission } from "@/lib/authorization";
import { ChartPageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ application?: string; program?: string; cycle?: string }>;
}>;

async function CompareContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("recommendation", "read");

  const { data, applicants, program } = await resolveSelection(await searchParams, "recommended");

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

  // Quick-compare pills: the applicant's choices plus the top recommendation.
  const pillIds = Array.from(
    new Set([...data.choices.map((c) => c.program_id), ...(data.ranking[0] ? [data.ranking[0].program_id] : [])]),
  );
  const pills = pillIds
    .map((id) => data.programs.find((p) => p.program_id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Same rule as the score breakdown: the course's minimum score per subject (compatibility rules).
  const radarRows = data.competencyScores.map((competency) => ({
    label: shortCompetencyName(competency.competency_name),
    score: competency.percent === null ? null : Math.round(competency.percent),
    required: program.weights.find((w) => w.competency_id === competency.competency_id)?.min_score ?? null,
  }));
  const match = data.ranking.find((r) => r.program_id === program.program_id)?.match ?? null;
  const base = `/recommendation/compare?application=${data.application_id}`;
  const hrefs = Object.fromEntries(data.ranking.map((r) => [r.program_id, `${base}&program=${r.program_id}`]));

  return (
    <PendingProvider>
      <div className="relative isolate min-h-full space-y-3 p-3 sm:p-4">
        <QcuWatermark />
        <h1 className="sr-only">Course compatibility comparison</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ParamSelect
            param="application"
            label="Applicant"
            value={String(data.application_id)}
            options={applicants.map((a) => ({ value: String(a.application_id), label: a.label }))}
            resetParams={["program"]}
          />
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
        </div>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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

          <section className="rounded-xl border border-neutral-500 bg-white/95 p-4">
            <h2 className="mb-3 font-semibold">Match per course (%)</h2>
            <PendingArea>
              <CourseMatchList
                ranking={data.ranking}
                selectedId={program.program_id}
                preferredId={data.preferred?.program_id}
                hrefs={hrefs}
              />
            </PendingArea>
            <p className="mt-3 text-xs text-neutral-600">Courses whose subject minimums are met come first, each by match. Select a course to compare.</p>
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
