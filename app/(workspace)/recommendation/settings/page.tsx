import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { RecommendationSwitch } from "@/components/recommendation/controls";
import MappingEditor from "@/components/recommendation/mapping-editor";
import { shortCompetencyName } from "@/features/recommendation/config";
import { getRecommendationSettings } from "@/features/recommendation/queries";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { GridEditorSkeleton } from "@/components/ui/skeletons";

async function SettingsContent() {
  await connection();
  const user = await requirePermission("recommendation", "read");

  const [canWrite, settings, programs, competencies] = await Promise.all([
    hasPermission(user.role, "recommendation", "write"),
    getRecommendationSettings(),
    prisma.tbl_program.findMany({
      where: { is_active: true },
      orderBy: { program_name: "asc" },
      select: {
        program_id: true,
        program_code: true,
        program_name: true,
        min_match: true,
        tbl_program_competency: { select: { competency_id: true, weight: true, min_score: true } },
      },
    }),
    prisma.tbl_competency.findMany({
      orderBy: { competency_id: "asc" },
      select: { competency_id: true, competency_name: true },
    }),
  ]);

  const initial = Object.fromEntries(
    programs.map((p) => [
      p.program_id,
      Object.fromEntries(p.tbl_program_competency.map((w) => [w.competency_id, Number(w.weight)])),
    ]),
  );

  const initialRules = Object.fromEntries(
    programs.map((p) => [
      p.program_id,
      Object.fromEntries(
        p.tbl_program_competency.map((w) => [w.competency_id, w.min_score === null ? null : Number(w.min_score)]),
      ),
    ]),
  );

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />

      <div>
        <h1 className="text-2xl font-bold">Mapping Settings</h1>
        <p className="max-w-3xl text-sm text-neutral-700">
          How much each exam competency counts toward each course, the minimum match a course needs, and its
          compatibility rules (minimum score per subject). Changes re-score the active school year&apos;s
          recommendations.
          {!canWrite && " You have view-only access."}
        </p>
      </div>

      <section
        aria-label="Recommendation settings"
        className="grid gap-4 rounded-xl border border-neutral-500 bg-white/90 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <RecommendationSwitch enabled={settings.enabled} canWrite={canWrite} />
        <div className="text-sm sm:text-right">
          <p>
            <span className="text-neutral-600">Scoring model:</span>{" "}
            <span className="font-medium">Weighted score</span>
          </p>
          <p className="text-xs text-neutral-600">Course match = Σ (competency score × weight) ÷ 100</p>
          {settings.updated_at && (
            <p className="mt-1 text-xs text-neutral-500">
              Switch last changed {new Date(settings.updated_at).toLocaleString("en-PH")}
              {settings.updated_by ? ` by ${settings.updated_by}` : ""}
            </p>
          )}
        </div>
      </section>

      {competencies.length === 0 ? (
        <p className="rounded-xl border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No competencies are set up. Run <code>npm run db:seed</code> to add them.
        </p>
      ) : (
        <section aria-labelledby="mapping-heading" className="space-y-3">
          <h2 id="mapping-heading" className="text-lg font-semibold">
            Course-to-competency mapping
          </h2>
          <MappingEditor
            programs={programs.map((p) => ({
              program_id: p.program_id,
              program_code: p.program_code,
              program_name: p.program_name,
              min_match: Number(p.min_match),
            }))}
            competencies={competencies.map((c) => ({
              competency_id: c.competency_id,
              name: c.competency_name,
              label: shortCompetencyName(c.competency_name),
            }))}
            initial={initial}
            initialRules={initialRules}
            canWrite={canWrite}
          />
        </section>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<GridEditorSkeleton label="mapping settings" cols={8} banner />}>
      <SettingsContent />
    </Suspense>
  );
}
