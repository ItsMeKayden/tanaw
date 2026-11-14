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
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course-to-Competency Mapping</h1>
          <p className="text-sm text-neutral-700">
            How much each exam competency counts toward a course match.
            {canWrite ? "" : " You have view-only access."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-green-600 px-3 py-1 font-medium text-white">Recommendations: ON</span>
          <span className="rounded-full border border-neutral-500 bg-white px-3 py-1">Model: Weighted score</span>
        </div>
      </div>

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
