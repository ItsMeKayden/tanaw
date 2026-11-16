import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import MappingEditor from "@/components/recommendation/mapping-editor";
import { MIN_MATCH, shortCompetencyName } from "@/features/recommendation/config";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function SettingsContent() {
  await connection();
  const user = await requirePermission("recommendation", "read");
  const canWrite = await hasPermission(user.role, "recommendation", "write");

  const [programs, competencies] = await Promise.all([
    prisma.tbl_program.findMany({
      where: { is_active: true },
      orderBy: { program_name: "asc" },
      select: {
        program_id: true,
        program_code: true,
        program_name: true,
        tbl_program_competency: { select: { competency_id: true, weight: true } },
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

  return (
    <div className="relative isolate min-h-full space-y-3 p-3 sm:p-4">
      <QcuWatermark />
      <h1 className="sr-only">Course-to-competency mapping</h1>

      {/* Settings row. Both are fixed for now: the data dictionary has no
          table for an on/off flag or other scoring models. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 text-sm"
          title="Recommendations are always on. Turning them off isn't stored anywhere yet."
        >
          <span
            role="switch"
            aria-checked="true"
            aria-disabled="true"
            aria-label="Enable recommendations"
            className="relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border border-green-700 bg-green-500"
          >
            <span className="absolute left-[17px] size-3 rounded-full bg-white shadow" />
          </span>
          Enable recommendations
        </div>
        <label className="flex items-center gap-2 text-sm" title="Weighted score is the only model available.">
          <span className="sr-only">Scoring model</span>
          <select
            disabled
            value="weighted"
            className="h-8 rounded-sm border border-neutral-500 bg-neutral-200 px-2.5 text-sm text-black disabled:opacity-100"
          >
            <option value="weighted">Model: Weighted score</option>
          </select>
        </label>
      </div>

      {!canWrite && <p className="text-sm text-neutral-700">You have view-only access.</p>}

      {competencies.length === 0 ? (
        <p className="rounded-xl border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No competencies are set up. Run <code>npm run db:seed</code> to add them.
        </p>
      ) : (
        <MappingEditor
          programs={programs.map((p) => ({
            program_id: p.program_id,
            program_code: p.program_code,
            program_name: p.program_name,
          }))}
          competencies={competencies.map((c) => ({
            competency_id: c.competency_id,
            name: c.competency_name,
            label: shortCompetencyName(c.competency_name),
          }))}
          initial={initial}
          minMatch={MIN_MATCH}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
