"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { deleteQuota, saveQuota } from "@/features/admission/actions/quota";
import { quotaFormSchema, type QuotaFormValues } from "@/features/admission/schemas";

export type QuotaRow = {
  quota_id: number;
  branch_id: number | null;
  program_id: number | null;
  scope: string;
  scope_label: string;
  branch_name: string;
  program_code: string;
  slots: number;
  applicants: number;
  passed: number;
  enrolled: number;
  updated_by: string | null;
};

type Feedback = { type: "success" | "error"; text: string } | null;

const EMPTY_QUOTA: QuotaFormValues = { branch_id: "", program_id: "", quota_slots: "" };

const cell = "border border-neutral-500 px-3 py-2";
const inputClass =
  "h-9 w-full rounded-lg border border-neutral-500 bg-white px-3 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

/** Filled share of a quota; enrolled can exceed slots (shown as over). */
function FillMeter({ enrolled, slots }: Readonly<{ enrolled: number; slots: number }>) {
  const pct = slots === 0 ? (enrolled > 0 ? 100 : 0) : Math.round((enrolled / slots) * 100);
  const over = enrolled > slots;

  return (
    <div className="flex min-w-36 items-center gap-2" title={`${enrolled} of ${slots} slots filled (${pct}%)`}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-r ${over ? "bg-red-600" : "bg-[#4a52c4]"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-14 text-right text-xs text-neutral-800 tabular-nums">
        {over && <span aria-hidden="true">⚠ </span>}
        {pct}%{over && <span className="sr-only"> (over quota)</span>}
      </span>
    </div>
  );
}

export default function QuotaManager({
  cycleId,
  rows,
  branches,
  programs,
  canWrite,
  cycleEnrolled,
}: Readonly<{
  cycleId: number;
  cycleEnrolled: number;
  rows: QuotaRow[];
  branches: { branch_id: number; branch_name: string }[];
  programs: { program_id: number; program_code: string; program_name: string }[];
  canWrite: boolean;
}>) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<QuotaFormValues>({
    resolver: zodResolver(quotaFormSchema),
    defaultValues: EMPTY_QUOTA,
    mode: "onTouched",
  });
  const form = { ...EMPTY_QUOTA, ...useWatch({ control }) };

  const existing = rows.find(
    (row) =>
      String(row.branch_id ?? "") === form.branch_id &&
      String(row.program_id ?? "") === form.program_id,
  );

  const submit = handleSubmit((values) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveQuota({ cycle_id: cycleId, ...values });
      if ("error" in result) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setFeedback({ type: "success", text: result.message });
      reset(EMPTY_QUOTA);
      router.refresh();
    });
  });

  function remove(row: QuotaRow) {
    if (!window.confirm(`Delete the ${row.scope_label.toLowerCase()} quota for ${row.branch_name} / ${row.program_code}?`)) {
      return;
    }
    setFeedback(null);

    startTransition(async () => {
      const result = await deleteQuota(row.quota_id);
      setFeedback(
        "error" in result
          ? { type: "error", text: result.error }
          : { type: "success", text: result.message },
      );
      router.refresh();
    });
  }

  const overall = rows.find((row) => row.scope === "OVERALL");
  const stats = [
    { label: "Overall slots", value: overall ? overall.slots : "Not set" },
    { label: "Enrolled this school year", value: cycleEnrolled },
    {
      label: "Remaining overall",
      value: overall ? Math.max(0, overall.slots - cycleEnrolled) : "--",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-500 bg-white/90 p-4">
            <p className="text-sm text-neutral-800">{stat.label}</p>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {canWrite && (
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-3 rounded-xl border border-[#9fa3e0] bg-[#e3e4f8]/85 p-4 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-start"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            Campus
            <select {...register("branch_id")} className={inputClass}>
              <option value="">All campuses</option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Program
            <select {...register("program_id")} className={inputClass}>
              <option value="">All programs</option>
              {programs.map((program) => (
                <option key={program.program_id} value={program.program_id}>
                  {program.program_code} – {program.program_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Slots
            <input
              type="number"
              min={0}
              max={100000}
              step={1}
              inputMode="numeric"
              {...register("quota_slots")}
              placeholder={existing ? String(existing.slots) : "e.g. 300"}
              aria-invalid={Boolean(errors.quota_slots)}
              aria-describedby={errors.quota_slots ? "quota-slots-error" : undefined}
              className={`${inputClass} ${errors.quota_slots ? "border-red-500" : ""}`}
            />
            {errors.quota_slots && (
              <span id="quota-slots-error" className="text-xs text-red-600">
                {errors.quota_slots.message}
              </span>
            )}
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="mt-6 h-9 rounded-full bg-[#191e73] px-5 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
          >
            {existing ? "Update quota" : "Add quota"}
          </button>
          <p className="text-xs text-neutral-600 sm:col-span-4">
            Leave campus or program as &ldquo;All&rdquo; for a broader quota.
            Saving the same campus + program again updates its slots.
          </p>
        </form>
      )}

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${
            feedback.type === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              {["Scope", "Campus", "Program", "Slots", "Enrolled", "Pending", "Remaining", "Filled", "Updated by"].map(
                (heading) => (
                  <th key={heading} className={`${cell} font-medium`}>
                    {heading}
                  </th>
                ),
              )}
              {canWrite && <th className={`${cell} font-medium`}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.quota_id} className="hover:bg-[#e3e4f8]/60">
                  <td className={cell}>{row.scope_label}</td>
                  <td className={cell}>{row.branch_name}</td>
                  <td className={cell}>{row.program_code}</td>
                  <td className={`${cell} tabular-nums`}>{row.slots}</td>
                  <td className={`${cell} tabular-nums`}>{row.enrolled}</td>
                  <td className={`${cell} tabular-nums`}>{row.passed}</td>
                  <td className={`${cell} tabular-nums`}>{Math.max(0, row.slots - row.enrolled)}</td>
                  <td className={cell}>
                    <FillMeter enrolled={row.enrolled} slots={row.slots} />
                  </td>
                  <td className={cell}>{row.updated_by ?? "--"}</td>
                  {canWrite && (
                    <td className={`${cell} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() =>
                          reset({
                            branch_id: String(row.branch_id ?? ""),
                            program_id: String(row.program_id ?? ""),
                            quota_slots: String(row.slots),
                          })
                        }
                        className="mr-2 rounded-md border border-neutral-500 px-2 py-0.5 text-xs hover:bg-neutral-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={isPending}
                        className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canWrite ? 10 : 9} className={`${cell} py-10 text-center text-neutral-600`}>
                  No quotas set for this school year.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
