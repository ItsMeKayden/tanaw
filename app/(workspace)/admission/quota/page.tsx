import { Suspense } from "react";
import { connection } from "next/server";

import { FilterSelect } from "@/components/admission/filter-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { QuotaPlanner } from "@/components/admission/quota-planner";
import { countForScope, getApplicationCounts, resolveCycle } from "@/features/admission/admission-stats";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { GridEditorSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[] }>;
}>;

async function QuotaContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);

  if (!cycle) {
    return (
      <div className="p-4">
        <h1 className="sr-only">Admission quota</h1>
        <p className="rounded-md border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      </div>
    );
  }

  const [programs, quotas, counts] = await Promise.all([
    prisma.tbl_program.findMany({
      where: { is_active: true },
      orderBy: { program_code: "asc" },
      select: { program_id: true, program_code: true, program_name: true },
    }),
    prisma.tbl_quota.findMany({
      where: { cycle_id: cycle.cycle_id, branch_id: null },
      select: { program_id: true, quota_slots: true },
    }),
    getApplicationCounts(cycle.cycle_id),
  ]);

  const courses = programs.map((program) => {
    const totals = countForScope(counts, null, program.program_id);
    return {
      ...program,
      slots: quotas.find((q) => q.program_id === program.program_id)?.quota_slots ?? null,
      admitted: totals.passed + totals.enrolled,
    };
  });

  const overallSlots = quotas.find((q) => q.program_id === null)?.quota_slots ?? null;

  return (
    <div className="relative isolate min-h-full p-3 sm:p-4">
      <QcuWatermark />
      <h1 className="sr-only">Admission quota, school year {cycle.school_year}</h1>

      <QuotaPlanner
        key={cycle.cycle_id}
        cycleId={cycle.cycle_id}
        overallSlots={overallSlots}
        courses={courses}
        canWrite={canWrite}
        schoolYearSelect={
          <FilterSelect
            param="cycle"
            label="School year"
            value={String(cycle.cycle_id)}
            options={cycles.map((c) => ({ value: String(c.cycle_id), label: c.school_year }))}
          />
        }
      />
    </div>
  );
}

export default function QuotaPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<GridEditorSkeleton label="quota" cols={6} />}>
      <QuotaContent searchParams={searchParams} />
    </Suspense>
  );
}
