import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeftRight, CircleCheck, ClipboardList, Clock, TriangleAlert } from "lucide-react";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { CycleSelect } from "@/components/admission/cycle-select";
import { AdvisoryDialog } from "@/components/recommendation/advisory-dialog";
import { GenerateButton } from "@/components/recommendation/controls";
import RecommendationTable from "@/components/recommendation/recommendation-table";
import { StatCard } from "@/components/ui/stat-card";
import { resolveCycle } from "@/features/admission/admission-stats";
import { MIN_MATCH } from "@/features/recommendation/config";
import { getRecommendationList } from "@/features/recommendation/queries";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string | string[] }> }>;

async function RecommendationsContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("recommendation", "read");
  const canWrite = await hasPermission(user.role, "recommendation", "write");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);
  const rows = cycle ? await getRecommendationList(cycle.cycle_id) : [];

  const courses = Array.from(
    new Map(
      rows
        .flatMap((row) => [row.preferred, row.recommended])
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => [c.code, { code: c.code, name: c.name }]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const compatible = rows.filter((r) => r.status === "COMPATIBLE").length;
  const alternative = rows.filter((r) => r.status === "ALTERNATIVE").length;
  const belowMinimum = rows.filter((r) => r.status === "BELOW_MINIMUM").length;
  const pending = rows.filter((r) => r.status === "NOT_GENERATED").length;
  const lastGenerated = rows
    .map((r) => r.generated_at)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <AdvisoryDialog />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Recommendation</h1>
          <p className="text-sm text-neutral-700">
            Compares each applicant&apos;s exam competency scores with each course&apos;s
            competency weights. A preferred course matching {MIN_MATCH}% or more is
            &ldquo;Compatible&rdquo;.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {cycle && <CycleSelect cycles={cycles} value={cycle.cycle_id} />}
          {canWrite && cycle && <GenerateButton cycleId={cycle.cycle_id} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            { label: "Examined applicants", value: rows.length, icon: ClipboardList, tone: "primary" },
            { label: "Compatible", value: compatible, icon: CircleCheck, tone: "success" },
            { label: "Alternative suggested", value: alternative, icon: ArrowLeftRight, tone: "info" },
            { label: "Below minimum", value: belowMinimum, icon: TriangleAlert, tone: "danger" },
            { label: "Not yet generated", value: pending, icon: Clock, tone: "muted" },
          ] as const
        ).map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {pending > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {pending} applicant{pending === 1 ? " has" : "s have"} no recommendation yet.
          {canWrite
            ? " Use “Generate recommendations” to score them."
            : " Ask a Guidance user to generate recommendations."}
        </p>
      )}

      <RecommendationTable rows={rows} courses={courses} />

      <p className="text-xs text-neutral-600">
        Model: weighted score · Minimum match: {MIN_MATCH}% (all courses)
        {lastGenerated && ` · Last generated ${new Date(lastGenerated).toLocaleString("en-PH")}`}
      </p>
    </div>
  );
}

export default function RecommendationsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <RecommendationsContent searchParams={searchParams} />
    </Suspense>
  );
}
