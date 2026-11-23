import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { tableStyles } from "@/components/ui/table-styles";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { ScoreVsRequirementChart } from "@/components/recommendation/charts";
import { ParamSelect } from "@/components/recommendation/controls";
import { PendingArea, PendingProvider } from "@/components/ui/pending-navigation";
import { shortCompetencyName } from "@/features/recommendation/config";
import { resolveSelection } from "@/features/recommendation/selection";
import { requirePermission } from "@/lib/authorization";
import { ChartPageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ application?: string; program?: string; cycle?: string }>;
}>;

const cell = tableStyles.td;

async function BreakdownContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("recommendation", "read");

  const { data, applicants, programs, program } = await resolveSelection(await searchParams, "preferred");

  const rows =
    data && program
      ? data.competencyScores.map((competency) => {
          const link = program.weights.find((w) => w.competency_id === competency.competency_id);
          const weight = link?.weight ?? 0;
          // Compatibility rule: the course's minimum score for this subject, if set.
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
        })
      : [];

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold">Score Breakdown</h1>
        <p className="text-sm text-neutral-700">
          Applicant subject scores against the course&apos;s compatibility rules (minimum score per
          subject, set in Mapping Settings). Advisory only: it doesn&apos;t change the admission stage.
        </p>
      </div>

      {!data || !program ? (
        <p className="rounded-xl border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No applicant has a generated recommendation yet.{" "}
          <Link href="/recommendation" className="text-[#191e73] underline">
            Go to Recommendations
          </Link>
          .
        </p>
      ) : (
        <PendingProvider>
          <div className="flex flex-wrap gap-3">
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

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
              <h2 className="mb-3 font-semibold">
                Applicant score vs. {program.program_code} requirement (%)
              </h2>
              <PendingArea>
                <ScoreVsRequirementChart rows={rows} />
              </PendingArea>
            </section>

            <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
              <h2 className="mb-3 font-semibold">Breakdown</h2>
              <PendingArea className={tableStyles.wrap}>
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
              </PendingArea>
              <p className="mt-3 text-sm text-neutral-700">
                {program.program_code} match:{" "}
                <span className="font-semibold">
                  {data.ranking.find((r) => r.program_id === program.program_id)?.match ?? "--"}%
                </span>
              </p>
            </section>
          </div>
        </PendingProvider>
      )}
    </div>
  );
}

export default function BreakdownPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<ChartPageSkeleton label="score breakdown" />}>
      <BreakdownContent searchParams={searchParams} />
    </Suspense>
  );
}
