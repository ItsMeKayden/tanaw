// Server-side aggregation for the Quota and Summary pages (imports Prisma).
import { prisma } from "@/lib/prisma";
import { ADMISSION_STAGES, ADMITTED_STAGES } from "@/features/admission/stages";

export async function getCycles() {
  return prisma.tbl_admission_cycle.findMany({
    orderBy: [{ is_active: "desc" }, { start_date: "desc" }],
    select: { cycle_id: true, school_year: true, is_active: true },
  });
}

/** Picks the cycle from ?cycle=, else the active one, else the latest. */
export async function resolveCycle(cycleParam: string | string[] | undefined) {
  const cycles = await getCycles();
  const requested = Number(Array.isArray(cycleParam) ? cycleParam[0] : cycleParam);
  const cycle =
    cycles.find((c) => c.cycle_id === requested) ??
    cycles.find((c) => c.is_active) ??
    cycles[0] ??
    null;

  return { cycles, cycle };
}

export type ApplicationCountRow = {
  branch_id: number | null;
  program_id: number | null;
  barangay_id: number | null;
  stage_name: string | null;
  count: number;
};

/** Application counts in a cycle grouped by campus, program, barangay and stage. */
export async function getApplicationCounts(cycleId: number): Promise<ApplicationCountRow[]> {
  const [groups, stages] = await Promise.all([
    prisma.tbl_application.groupBy({
      by: ["branch_id", "program_id", "barangay_id", "current_stage_id"],
      where: { cycle_id: cycleId },
      _count: { _all: true },
    }),
    prisma.tbl_admission_stage.findMany({ select: { stage_id: true, stage_name: true } }),
  ]);

  const stageNames = new Map(stages.map((s) => [s.stage_id, s.stage_name]));

  return groups.map((group) => ({
    branch_id: group.branch_id,
    program_id: group.program_id,
    barangay_id: group.barangay_id,
    stage_name:
      group.current_stage_id === null ? null : (stageNames.get(group.current_stage_id) ?? null),
    count: group._count._all,
  }));
}

/** Totals for the rows that match a quota's campus/program (null = any). */
export function countForScope(
  rows: ApplicationCountRow[],
  branchId: number | null,
  programId: number | null,
) {
  let applicants = 0;
  let passed = 0;
  let enrolled = 0;
  let admitted = 0;

  for (const row of rows) {
    if (branchId !== null && row.branch_id !== branchId) continue;
    if (programId !== null && row.program_id !== programId) continue;

    applicants += row.count;
    if (row.stage_name === ADMISSION_STAGES.PASSED) passed += row.count;
    if (row.stage_name === ADMISSION_STAGES.ENROLLED) enrolled += row.count;
    if (ADMITTED_STAGES.includes(row.stage_name ?? "")) admitted += row.count;
  }

  return { applicants, passed, enrolled, admitted };
}

export const QUOTA_SCOPES = {
  OVERALL: "OVERALL",
  BRANCH: "BRANCH",
  PROGRAM: "PROGRAM",
  BRANCH_PROGRAM: "BRANCH_PROGRAM",
} as const;

export function quotaScopeFor(branchId: number | null, programId: number | null) {
  if (branchId && programId) return QUOTA_SCOPES.BRANCH_PROGRAM;
  if (branchId) return QUOTA_SCOPES.BRANCH;
  if (programId) return QUOTA_SCOPES.PROGRAM;
  return QUOTA_SCOPES.OVERALL;
}

export const QUOTA_SCOPE_LABELS: Record<string, string> = {
  OVERALL: "Whole cycle",
  BRANCH: "Campus",
  PROGRAM: "Program",
  BRANCH_PROGRAM: "Campus + program",
};
