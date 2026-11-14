import { Suspense } from "react";
import { connection } from "next/server";

import { BarList } from "@/components/admission/bar-list";
import { CycleSelect } from "@/components/admission/cycle-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import {
  countForScope,
  getApplicationCounts,
  resolveCycle,
} from "@/features/admission/admission-stats";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[] }>;
}>;

function percent(part: number, whole: number) {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

function Kpi({
  label,
  value,
  note,
}: Readonly<{ label: string; value: string | number; note?: string | null }>) {
  return (
    <div className="rounded-xl border border-neutral-500 bg-white/90 p-4">
      <p className="text-sm text-neutral-800">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-neutral-600">{note}</p>}
    </div>
  );
}

const cell = "border border-neutral-500 px-3 py-2";

function BreakdownTable({
  caption,
  firstColumn,
  rows,
}: Readonly<{
  caption: string;
  firstColumn: string;
  rows: {
    key: number;
    label: string;
    applicants: number;
    admitted: number;
    enrolled: number;
    slots: number | null;
  }[];
}>) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{caption}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              {[firstColumn, "Applicants", "Passed", "Enrolled", "Quota", "Filled"].map((heading) => (
                <th key={heading} className={`${cell} font-medium`}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const filled = row.slots ? percent(row.enrolled, row.slots) : null;
              return (
                <tr key={row.key} className="hover:bg-[#e3e4f8]/60">
                  <td className={cell}>{row.label}</td>
                  <td className={`${cell} tabular-nums`}>{row.applicants}</td>
                  <td className={`${cell} tabular-nums`}>{row.admitted}</td>
                  <td className={`${cell} tabular-nums`}>{row.enrolled}</td>
                  <td className={`${cell} tabular-nums`}>{row.slots ?? "--"}</td>
                  <td className={`${cell} tabular-nums`}>
                    {filled === null ? "--" : `${filled}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function SummaryContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("admission", "read");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);

  if (!cycle) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Summary</h1>
        <p className="mt-2 text-sm text-neutral-600">No admission cycle exists yet.</p>
      </div>
    );
  }

  const cycleId = cycle.cycle_id;

  const [counts, stages, programs, branches, districts, quotas, examined, examPassed, examFailed, setting] =
    await Promise.all([
      getApplicationCounts(cycleId),
      prisma.tbl_admission_stage.findMany({
        orderBy: { stage_order: "asc" },
        select: { stage_name: true },
      }),
      prisma.tbl_program.findMany({
        orderBy: { program_code: "asc" },
        select: { program_id: true, program_code: true },
      }),
      prisma.tbl_branch.findMany({
        orderBy: { branch_id: "asc" },
        select: { branch_id: true, branch_name: true },
      }),
      prisma.tbl_district.findMany({
        orderBy: { district_name: "asc" },
        select: {
          district_name: true,
          tbl_barangay: { select: { barangay_id: true } },
        },
      }),
      prisma.tbl_quota.findMany({
        where: { cycle_id: cycleId },
        select: { branch_id: true, program_id: true, quota_slots: true },
      }),
      prisma.tbl_application.count({
        where: { cycle_id: cycleId, tbl_exam_result: { some: {} } },
      }),
      prisma.tbl_application.count({
        where: {
          cycle_id: cycleId,
          tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } },
        },
      }),
      prisma.tbl_application.count({
        where: {
          cycle_id: cycleId,
          tbl_exam_result: { some: {}, none: { result_status: EXAM_RESULT_PASSED } },
        },
      }),
      prisma.tbl_passing_score_setting.findFirst({
        where: { cycle_id: cycleId },
        orderBy: { effective_date: "desc" },
        select: { passing_value: true, target_pass_rate: true, criteria_type: true },
      }),
    ]);

  const totals = countForScope(counts, null, null);
  const notEnrolled = counts
    .filter((row) => row.stage_name === ADMISSION_STAGES.NOT_ENROLLED)
    .reduce((sum, row) => sum + row.count, 0);

  const passRate = percent(examPassed, examined);
  const targetRate =
    setting?.target_pass_rate == null ? null : Math.round(Number(setting.target_pass_rate) * 1000) / 10;
  const yieldRate = percent(totals.enrolled, totals.admitted);

  const quotaFor = (branchId: number | null, programId: number | null) =>
    quotas.find((q) => q.branch_id === branchId && q.program_id === programId)?.quota_slots ?? null;

  const byStage = stages.map((stage) => ({
    label: stage.stage_name,
    value: counts
      .filter((row) => row.stage_name === stage.stage_name)
      .reduce((sum, row) => sum + row.count, 0),
  }));

  const byDistrict = districts.map((district) => {
    const ids = new Set(district.tbl_barangay.map((b) => b.barangay_id));
    return {
      label: district.district_name,
      value: counts
        .filter((row) => row.barangay_id !== null && ids.has(row.barangay_id))
        .reduce((sum, row) => sum + row.count, 0),
    };
  });

  const programRows = programs
    .map((program) => ({
      key: program.program_id,
      label: program.program_code,
      ...countForScope(counts, null, program.program_id),
      slots: quotaFor(null, program.program_id),
    }))
    .filter((row) => row.applicants > 0 || row.slots !== null);

  const branchRows = branches
    .map((branch) => ({
      key: branch.branch_id,
      label: branch.branch_name,
      ...countForScope(counts, branch.branch_id, null),
      slots: quotaFor(branch.branch_id, null),
    }))
    .filter((row) => row.applicants > 0 || row.slots !== null);

  const unassignedCampus = countForScope(
    counts.filter((row) => row.branch_id === null),
    null,
    null,
  );
  if (unassignedCampus.applicants > 0) {
    branchRows.push({ key: 0, label: "No campus chosen", ...unassignedCampus, slots: null });
  }

  const overallSlots = quotaFor(null, null);

  return (
    <div className="relative isolate min-h-full space-y-6 p-4 sm:p-6">
      <QcuWatermark />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Summary</h1>
          <p className="text-sm text-neutral-700">
            Admission results for school year {cycle.school_year}.
          </p>
        </div>
        <CycleSelect cycles={cycles} value={cycleId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Applicants" value={totals.applicants} />
        <Kpi
          label="Took the exam"
          value={examined}
          note={totals.applicants ? `${percent(examined, totals.applicants)}% of applicants` : null}
        />
        <Kpi
          label="Passed"
          value={examPassed}
          note={
            passRate === null
              ? null
              : `${passRate}% pass rate${targetRate === null ? "" : ` · target ${targetRate}%`}`
          }
        />
        <Kpi label="Failed" value={examFailed} />
        <Kpi
          label="Enrolled"
          value={totals.enrolled}
          note={
            overallSlots === null
              ? yieldRate === null
                ? null
                : `${yieldRate}% of passed`
              : `of ${overallSlots} slots · ${percent(totals.enrolled, overallSlots) ?? 0}% filled`
          }
        />
        <Kpi label="Not enrolled" value={notEnrolled} note={`${totals.passed} still pending`} />
      </div>

      {setting && (
        <p className="text-sm text-neutral-700">
          Passing score (reference):{" "}
          <span className="font-medium">
            {setting.passing_value === null ? "--" : Number(setting.passing_value)}
          </span>
          {setting.criteria_type ? ` (${setting.criteria_type})` : ""}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
          <h2 className="mb-3 text-lg font-semibold">Applicants by current stage</h2>
          <BarList rows={byStage} ariaLabel="Applicants by current stage" />
        </section>
        <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
          <h2 className="mb-3 text-lg font-semibold">Applicants by district</h2>
          <BarList rows={byDistrict} ariaLabel="Applicants by district" />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable caption="By program" firstColumn="Program" rows={programRows} />
        <BreakdownTable caption="By campus" firstColumn="Campus" rows={branchRows} />
      </div>
      <p className="text-xs text-neutral-600">
        &ldquo;Passed&rdquo; counts admitted applicants (Passed, Enrolled, or
        Not Enrolled). Quota and Filled use program-only and campus-only
        quotas; set them on the Quota page.
      </p>
    </div>
  );
}

export default function SummaryPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <SummaryContent searchParams={searchParams} />
    </Suspense>
  );
}
