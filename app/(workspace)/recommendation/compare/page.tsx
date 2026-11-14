import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { MatchContributionChart, MatchPerCourse } from "@/components/recommendation/charts";
import { ParamSelect } from "@/components/recommendation/controls";
import { shortCompetencyName } from "@/features/recommendation/config";
import { resolveSelection } from "@/features/recommendation/selection";
import { requirePermission } from "@/lib/authorization";

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

  const contribution = data.competencyScores.map((competency) => {
    const weight = program.weights.find((w) => w.competency_id === competency.competency_id)?.weight ?? 0;
    return {
      label: shortCompetencyName(competency.competency_name),
      weight,
      score: competency.percent,
      contribution: Math.round(((competency.percent ?? 0) * weight) / 100 * 10) / 10,
    };
  });
  const match = data.ranking.find((r) => r.program_id === program.program_id)?.match ?? null;
  const base = `/recommendation/compare?application=${data.application_id}`;

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold">Course Comparison</h1>
        <p className="text-sm text-neutral-700">
          How {data.full_name}&apos;s competency scores build the match for each course.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ParamSelect
          param="application"
          label="Applicant"
          value={String(data.application_id)}
          options={applicants.map((a) => ({ value: String(a.application_id), label: a.label }))}
          resetParams={["program"]}
        />
        <span className="text-sm text-neutral-700">Compare with:</span>
        {pills.map((p) => {
          const active = p.program_id === program.program_id;
          return (
            <Link
              key={p.program_id}
              href={`${base}&program=${p.program_id}`}
              aria-current={active ? "true" : undefined}
              title={p.program_name}
              className={`rounded-full border px-4 py-1 text-sm ${
                active ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-500 bg-white hover:bg-neutral-100"
              }`}
            >
              {p.program_code}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
          <h2 className="mb-1 font-semibold">
            Profile comparison – {program.program_code}
          </h2>
          <p className="mb-4 text-xs text-neutral-600">{program.program_name}</p>
          <MatchContributionChart rows={contribution} total={match} courseLabel={program.program_code} />
        </section>

        <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
          <h2 className="mb-2 font-semibold">Match per course (%)</h2>
          <MatchPerCourse
            ranking={data.ranking}
            selectedId={program.program_id}
            preferredId={data.preferred?.program_id}
            hrefFor={(programId) => `${base}&program=${programId}`}
          />
        </section>
      </div>
    </div>
  );
}

export default function ComparePage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}
