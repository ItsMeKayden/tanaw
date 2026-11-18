"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { saveQuotaPlan } from "@/features/admission/actions/quota";
import { toast } from "@/components/ui/toaster";

export type QuotaCourse = {
  program_id: number;
  program_code: string;
  program_name: string;
  /** Saved per-course quota, or null. */
  slots: number | null;
  /** Applicants holding a slot (Passed + Enrolled). */
  admitted: number;
};

type Feedback = { type: "success" | "error"; text: string } | null;

/** Splits a target evenly; the first courses take any remainder. */
function evenSplit(total: number, count: number) {
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

const toInput = (n: number | null) => (n === null ? "" : String(n));
const parse = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const cell = "border border-neutral-500 px-3 py-1.5 text-center";

export function QuotaPlanner({
  cycleId,
  schoolYearSelect,
  overallSlots,
  courses,
  canWrite,
}: Readonly<{
  cycleId: number;
  schoolYearSelect: ReactNode;
  overallSlots: number | null;
  courses: QuotaCourse[];
  canWrite: boolean;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const savedSplit = useMemo(() => {
    if (overallSlots === null) return courses.every((c) => c.slots === null);
    const split = evenSplit(overallSlots, courses.length);
    return courses.every((c, i) => c.slots === split[i]);
  }, [overallSlots, courses]);

  const [overall, setOverall] = useState(toInput(overallSlots));
  const [split, setSplit] = useState(savedSplit);
  const [manual, setManual] = useState(() => courses.map((c) => toInput(c.slots)));

  const overallNumber = parse(overall);
  const quotas: (number | null)[] = split
    ? overallNumber === null
      ? courses.map(() => null)
      : evenSplit(overallNumber, courses.length)
    : manual.map(parse);

  const totalAdmitted = courses.reduce((sum, c) => sum + c.admitted, 0);
  const totalQuota = quotas.reduce<number>((sum, q) => sum + (q ?? 0), 0);
  const anyQuota = quotas.some((q) => q !== null);
  const target = overallNumber ?? (anyQuota ? totalQuota : null);
  const admittedPct = target ? pct(totalAdmitted, target) : 0;
  const mismatch = !split && overallNumber !== null && anyQuota && totalQuota !== overallNumber;

  function cancel() {
    setOverall(toInput(overallSlots));
    setSplit(savedSplit);
    setManual(courses.map((c) => toInput(c.slots)));
    setFeedback(null);
  }

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveQuotaPlan(cycleId, {
        overall,
        courses: courses.map((c, i) => ({ program_id: c.program_id, slots: toInput(quotas[i]) })),
      });
      if ("error" in result) {
        setFeedback({ type: "error", text: result.error });
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  const fieldClass =
    "h-8 w-full rounded-sm border border-neutral-500 bg-white px-2 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20 disabled:bg-neutral-100";

  return (
    <div className="grid min-h-full gap-3 lg:grid-cols-[240px_1fr]">
      {/* Set quota */}
      <section className="flex flex-col rounded-md border border-neutral-500 bg-white/95 p-3">
        <h2 className="mb-3 font-semibold">Set quota</h2>

        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <p className="text-neutral-800">School year</p>
            {schoolYearSelect}
          </div>

          <label className="block space-y-1">
            <span className="text-neutral-800">Overall target</span>
            <input
              type="number"
              min={0}
              max={100000}
              inputMode="numeric"
              value={overall}
              disabled={!canWrite}
              onChange={(e) => setOverall(e.target.value)}
              placeholder="e.g. 1200"
              className={fieldClass}
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={split}
              disabled={!canWrite}
              onClick={() => {
                if (split) setManual(quotas.map(toInput));
                setSplit(!split);
              }}
              className={`relative mt-0.5 inline-flex h-4 w-8 shrink-0 items-center rounded-full border transition-colors ${
                split ? "border-green-700 bg-green-500" : "border-neutral-500 bg-neutral-200"
              }`}
            >
              <span className="sr-only">Split per course automatically</span>
              <span
                className={`absolute h-3 w-3 rounded-full bg-white shadow transition-[left] ${split ? "left-[17px]" : "left-0.5"}`}
              />
            </button>
            <span className="text-xs leading-tight text-neutral-800">
              Split per course automatically
            </span>
          </label>

          <div className="space-y-1">
            <p className="text-neutral-800 tabular-nums">
              Current admitted: {totalAdmitted.toLocaleString("en-US")} ({admittedPct}%)
            </p>
            <div
              className="h-3 overflow-hidden rounded-full border border-neutral-500 bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, admittedPct)}
              aria-label="Admitted share of target"
            >
              <div
                className={`h-full ${admittedPct > 100 ? "bg-red-600" : "bg-[#191e73]"}`}
                style={{ width: `${Math.min(100, admittedPct)}%` }}
              />
            </div>
            {target === null && <p className="text-xs text-neutral-600">No target set yet.</p>}
          </div>

          {mismatch && (
            <p className="rounded-sm border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Course quotas add up to {totalQuota.toLocaleString("en-US")}, not the overall target of{" "}
              {overallNumber?.toLocaleString("en-US")}.
            </p>
          )}
        </div>

        {feedback && (
          <p
            role={feedback.type === "error" ? "alert" : "status"}
            className={`mt-4 rounded-sm border p-2 text-xs ${
              feedback.type === "error"
                ? "border-red-300 bg-red-50 text-red-800"
                : "border-green-300 bg-green-50 text-green-800"
            }`}
          >
            {feedback.text}
          </p>
        )}

        {canWrite && (
          <div className="mt-auto space-y-2 pt-6">
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="h-8 w-full rounded-md border border-neutral-500 bg-white text-sm font-medium hover:bg-neutral-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-8 w-full rounded-md bg-[#191e73] text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save quota"}
            </button>
          </div>
        )}
      </section>

      {/* Quota tracking */}
      <section className="rounded-md border border-neutral-500 bg-white/95 p-3">
        <h2 className="mb-3 font-semibold">Quota tracking by course</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#c5c8f0]">
                <th className={`${cell} text-left font-medium`}>Course</th>
                {["Quota", "Admitted", "Remaining", "Filled"].map((h) => (
                  <th key={h} className={`${cell} font-medium`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${cell} py-8 text-neutral-600`}>
                    No active courses.
                  </td>
                </tr>
              )}
              {courses.map((course, i) => {
                const quota = quotas[i];
                const over = quota !== null && course.admitted > quota;
                return (
                  <tr key={course.program_id} className="hover:bg-[#e3e4f8]/60">
                    <td className={`${cell} text-left`} title={course.program_name}>
                      {course.program_code}
                    </td>
                    <td className={`${cell} w-28`}>
                      {canWrite && !split ? (
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          inputMode="numeric"
                          aria-label={`${course.program_code} quota`}
                          value={manual[i]}
                          onChange={(e) =>
                            setManual((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                          }
                          placeholder="--"
                          className="h-7 w-20 rounded-sm border border-neutral-400 px-1.5 text-center text-sm tabular-nums"
                        />
                      ) : (
                        <span className="tabular-nums">{quota ?? "--"}</span>
                      )}
                    </td>
                    <td className={`${cell} tabular-nums`}>{course.admitted}</td>
                    <td className={`${cell} tabular-nums`}>
                      {quota === null ? "--" : Math.max(0, quota - course.admitted)}
                    </td>
                    <td className={`${cell} tabular-nums ${over ? "font-semibold text-red-700" : ""}`}>
                      {quota === null ? "--" : `${pct(course.admitted, quota)}%`}
                      {over && <span className="sr-only"> (over quota)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {courses.length > 0 && (
              <tfoot>
                <tr className="bg-[#7f86e0] font-medium text-white">
                  <td className={`${cell} text-left`}>Total</td>
                  <td className={`${cell} tabular-nums`}>{anyQuota ? totalQuota : "--"}</td>
                  <td className={`${cell} tabular-nums`}>{totalAdmitted}</td>
                  <td className={`${cell} tabular-nums`}>
                    {anyQuota ? Math.max(0, totalQuota - totalAdmitted) : "--"}
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {anyQuota ? `${pct(totalAdmitted, totalQuota)}%` : "--"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Admitted counts applicants who passed or enrolled. Applicants marked Not Enrolled free their slot.
        </p>
      </section>
    </div>
  );
}
