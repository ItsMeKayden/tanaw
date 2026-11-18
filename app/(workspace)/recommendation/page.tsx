import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeftRight, CircleCheck, ClipboardList, Clock, PowerOff, TriangleAlert } from "lucide-react";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { CycleSelect } from "@/components/admission/cycle-select";
import { AdvisoryDialog } from "@/components/recommendation/advisory-dialog";
import { GenerateButton } from "@/components/recommendation/controls";
import RecommendationTable from "@/components/recommendation/recommendation-table";
import { StatCard } from "@/components/ui/stat-card";
import { resolveCycle } from "@/features/admission/admission-stats";
import { getRecommendationList, getRecommendationSettings } from "@/features/recommendation/queries";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { TablePageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string | string[] }> }>;

async function RecommendationsContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("recommendation", "read");
  const canWrite = await hasPermission(user.role, "recommendation", "write");

  const [{ cycles, cycle }, settings] = await Promise.all([
    resolveCycle((await searchParams).cycle),
    getRecommendationSettings(),
  ]);
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

      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-bold">Course Recommendation</h1>
          <p className="mt-1 text-sm text-neutral-700">
            Compares each applicant&apos;s exam subject scores with each course&apos;s weights and compatibility
            rules. A preferred course is &ldquo;Compatible&rdquo; when it reaches its minimum match and every subject
            minimum. Advisory only: results never change an applicant&apos;s admission stage.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-3 xl:justify-end">
          {cycle && <CycleSelect cycles={cycles} value={cycle.cycle_id} />}
          {canWrite && cycle && settings.enabled && <GenerateButton cycleId={cycle.cycle_id} />}
        </div>
      </header>

      {!settings.enabled && (
        <p className="flex items-start gap-2 rounded-lg border border-neutral-400 bg-neutral-100 p-3 text-sm text-neutral-800">
          <PowerOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Recommendations are turned off, so results below aren&apos;t being generated or updated.{" "}
            <Link href="/recommendation/settings" className="font-medium text-[#191e73] underline">
              Mapping Settings
            </Link>
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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

      {pending > 0 && settings.enabled && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {pending} applicant{pending === 1 ? " has" : "s have"} no recommendation yet.
          {canWrite
            ? " Use “Generate recommendations” to score them."
            : " Ask a Guidance user to generate recommendations."}
        </p>
      )}

      <RecommendationTable rows={rows} courses={courses} />

      <p className="text-xs text-neutral-600">
        Model: weighted score · Minimum match set per course in{" "}
        <Link href="/recommendation/settings" className="underline">
          Mapping Settings
        </Link>
        {lastGenerated && ` · Last generated ${new Date(lastGenerated).toLocaleString("en-PH")}`}
      </p>
    </div>
  );
}

export default function RecommendationsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<TablePageSkeleton label="recommendations" stats={5} chips={3} cols={5} actions={2} />}>
      <RecommendationsContent searchParams={searchParams} />
    </Suspense>
  );
}
