import { Suspense } from "react";
import { connection } from "next/server";

import { CycleSelect } from "@/components/admission/cycle-select";
import QuotaManager, { type QuotaRow } from "@/components/admission/quota-manager";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import {
  QUOTA_SCOPE_LABELS,
  countForScope,
  getApplicationCounts,
  quotaScopeFor,
  resolveCycle,
} from "@/features/admission/admission-stats";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[] }>;
}>;

async function QuotaContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);

  const [branches, programs] = await Promise.all([
    prisma.tbl_branch.findMany({
      where: { is_active: true },
      orderBy: { branch_id: "asc" },
      select: { branch_id: true, branch_name: true },
    }),
    prisma.tbl_program.findMany({
      where: { is_active: true },
      orderBy: { program_code: "asc" },
      select: { program_id: true, program_code: true, program_name: true },
    }),
  ]);

  let rows: QuotaRow[] = [];
  let cycleEnrolled = 0;

  if (cycle) {
    const [quotas, counts] = await Promise.all([
      prisma.tbl_quota.findMany({
        where: { cycle_id: cycle.cycle_id },
        select: {
          quota_id: true,
          branch_id: true,
          program_id: true,
          quota_scope: true,
          quota_slots: true,
          tbl_branch: { select: { branch_name: true } },
          tbl_program: { select: { program_code: true } },
          tbl_user_account: { select: { full_name: true } },
        },
      }),
      getApplicationCounts(cycle.cycle_id),
    ]);

    cycleEnrolled = countForScope(counts, null, null).enrolled;

    const scopeOrder = ["OVERALL", "BRANCH", "PROGRAM", "BRANCH_PROGRAM"];

    rows = quotas
      .map((quota) => {
        const scope = quota.quota_scope ?? quotaScopeFor(quota.branch_id, quota.program_id);
        const totals = countForScope(counts, quota.branch_id, quota.program_id);
        return {
          quota_id: quota.quota_id,
          branch_id: quota.branch_id,
          program_id: quota.program_id,
          scope,
          scope_label: QUOTA_SCOPE_LABELS[scope] ?? scope,
          branch_name: quota.tbl_branch?.branch_name ?? "All campuses",
          program_code: quota.tbl_program?.program_code ?? "All programs",
          slots: quota.quota_slots,
          ...totals,
          updated_by: quota.tbl_user_account?.full_name ?? null,
        };
      })
      .sort(
        (a, b) =>
          scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope) ||
          a.branch_name.localeCompare(b.branch_name) ||
          a.program_code.localeCompare(b.program_code),
      );
  }

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quota</h1>
          <p className="text-sm text-neutral-700">
            Available slots per campus and program. Enrolled applicants fill
            the slots; passed applicants still awaiting verification are shown
            as pending.
          </p>
        </div>
        {cycle && <CycleSelect cycles={cycles} value={cycle.cycle_id} />}
      </div>

      {cycle ? (
        <QuotaManager
          cycleId={cycle.cycle_id}
          rows={rows}
          branches={branches}
          programs={programs}
          canWrite={canWrite}
          cycleEnrolled={cycleEnrolled}
        />
      ) : (
        <p className="rounded-xl border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      )}
    </div>
  );
}

export default function QuotaPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <QuotaContent searchParams={searchParams} />
    </Suspense>
  );
}
