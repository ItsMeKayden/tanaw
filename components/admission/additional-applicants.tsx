"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { CheckCheck, DoorOpen, ListChecks, Search, UserPlus, Users } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import { tableStyles } from "@/components/ui/table-styles";
import { toast } from "@/components/ui/toaster";
import { admitAdditionalBatch } from "@/features/admission/actions/additional-applicants";
import type { QualifiedApplicant } from "@/features/admission/additional-applicants";
import { createSlotTracker, totalOpenSlots, type QuotaSlot } from "@/features/admission/slot-math";

const formatCount = (value: number) => (value === Infinity ? "No limit" : value.toLocaleString("en-US"));

const RANK_BADGES = ["bg-[#191e73] text-white", "bg-[#3a41a8] text-white", "bg-[#6b71c9] text-white"];

export function AdditionalApplicants({
  cycleId,
  applicants,
  quotas,
  courseCodes,
  canWrite,
  schoolYearSelect,
}: Readonly<{
  cycleId: number;
  /** Ranked best first. */
  applicants: QualifiedApplicant[];
  quotas: QuotaSlot[];
  courseCodes: Record<number, string>;
  canWrite: boolean;
  schoolYearSelect: ReactNode;
}>) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openSlots = totalOpenSlots(quotas);

  // Free slots per applicant once the selected ones (best-ranked first) have taken theirs.
  const { freeFor, selectable } = useMemo(() => {
    const tracker = createSlotTracker(quotas);
    for (const applicant of applicants) if (selected.has(applicant.application_id)) tracker.take(applicant);
    const free = new Map(applicants.map((a) => [a.application_id, tracker.available(a)]));
    return { freeFor: (a: QualifiedApplicant) => free.get(a.application_id) ?? 0, selectable: tracker };
  }, [applicants, quotas, selected]);

  // The best-ranked applicants that fit the free slots (each course's quota included).
  const topPicks = useMemo(() => {
    const tracker = createSlotTracker(quotas);
    return applicants.filter((a) => tracker.take(a)).map((a) => a.application_id);
  }, [applicants, quotas]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) =>
      [a.name, a.application_no, a.course_code, a.course_name, a.campus].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [applicants, query]);

  const ranks = useMemo(() => new Map(applicants.map((a, i) => [a.application_id, i + 1])), [applicants]);
  const chosen = applicants.filter((a) => selected.has(a.application_id));
  const byCourse = Object.entries(
    chosen.reduce<Record<string, number>>((acc, a) => {
      const key = a.course_code ?? "No course";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  function toggle(applicant: QualifiedApplicant) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(applicant.application_id)) next.delete(applicant.application_id);
      else if (selectable.available(applicant) > 0) next.add(applicant.application_id);
      return next;
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await admitAdditionalBatch(cycleId, [...selected]);
      toast.fromResult(result);
      if ("success" in result) {
        setSelected(new Set());
        setConfirming(false);
      }
    });
  }

  const quotaNote =
    quotas.length === 0
      ? "No quota is set for this school year, so there is no limit."
      : quotas
          .filter((q) => q.program_id !== null)
          .filter((q) => q.remaining > 0)
          .map((q) => `${courseCodes[q.program_id!] ?? "Course"} ${q.remaining}`)
          .join(" · ") || "Every course quota is full.";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={DoorOpen}
          label="Open slots"
          value={formatCount(openSlots)}
          note={quotas.length ? "Quota minus Passed and Enrolled" : "No quota set"}
          tone={openSlots === 0 ? "muted" : "success"}
        />
        <StatCard
          icon={Users}
          label="Qualified, not yet admitted"
          value={applicants.length}
          note="Passed after their course was full"
          tone="warning"
        />
        <StatCard
          icon={ListChecks}
          label="Selected for batch"
          value={selected.size}
          note={`of ${formatCount(Math.min(openSlots, applicants.length))} that can be admitted`}
          tone="primary"
        />
      </div>

      <section className="space-y-3 rounded-xl border border-neutral-400 bg-white/90 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {schoolYearSelect}
          <label className="relative">
            <span className="sr-only">Search qualified applicants</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, application no., course…"
              className="h-9 w-64 rounded-lg border border-neutral-300 bg-white pr-3 pl-8 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20"
            />
          </label>

          {canWrite && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={topPicks.length === 0 || isPending}
                onClick={() => setSelected(new Set(topPicks))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                title="Select the highest-ranked applicants that fit the open slots of their course"
              >
                <CheckCheck className="size-4" aria-hidden="true" />
                Select top {topPicks.length}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  disabled={isPending}
                  className="h-9 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-black"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                disabled={selected.size === 0 || isPending}
                onClick={() => setConfirming(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-50"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Confirm additional batch{selected.size ? ` (${selected.size})` : ""}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-600">
          <span className="font-medium text-neutral-800">Free slots by course:</span> {quotaNote}
        </p>

        <div className={tableStyles.wrap}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className={tableStyles.headRow}>
                {canWrite && (
                  <th className={`${tableStyles.th} w-12`}>
                    <span className="sr-only">Select</span>
                  </th>
                )}
                <th className={`${tableStyles.th} w-16`}>Rank</th>
                <th className={tableStyles.th}>Applicant</th>
                <th className={`${tableStyles.th} text-right`}>Score</th>
                <th className={tableStyles.th}>Preferred course</th>
                <th className={tableStyles.th}>Slot available</th>
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className={tableStyles.empty}>
                    {applicants.length === 0
                      ? "Nobody is on the waiting list. Applicants who pass the exam after their course's quota is full appear here."
                      : "No qualified applicants match your search."}
                  </td>
                </tr>
              ) : (
                visible.map((applicant) => {
                  const rank = ranks.get(applicant.application_id) ?? 0;
                  const isSelected = selected.has(applicant.application_id);
                  const free = freeFor(applicant);
                  const blocked = !isSelected && free <= 0;
                  return (
                    <tr
                      key={applicant.application_id}
                      className={`${tableStyles.row} ${isSelected ? "bg-[#eef0fd] shadow-[inset_3px_0_0_#191e73]" : ""} ${
                        blocked ? "text-neutral-500" : ""
                      }`}
                    >
                      {canWrite && (
                        <td className={tableStyles.td}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={blocked || isPending}
                            onChange={() => toggle(applicant)}
                            aria-label={`Select ${applicant.name}`}
                            title={blocked ? "No free slot left in this course" : undefined}
                            className="size-4 cursor-pointer accent-[#191e73] disabled:cursor-not-allowed"
                          />
                        </td>
                      )}
                      <td className={tableStyles.td}>
                        <span
                          className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                            RANK_BADGES[rank - 1] ?? "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {rank}
                        </span>
                      </td>
                      <td className={tableStyles.td}>
                        <span className="block font-medium text-neutral-900">{applicant.name}</span>
                        <span className="block text-xs text-neutral-600 tabular-nums">{applicant.application_no}</span>
                      </td>
                      <td className={`${tableStyles.td} text-right`}>
                        <span className="block font-semibold text-neutral-900 tabular-nums">
                          {applicant.percentage === null ? "--" : `${applicant.percentage}%`}
                        </span>
                        {applicant.raw_score !== null && (
                          <span className="block text-xs text-neutral-600 tabular-nums">{applicant.raw_score} pts</span>
                        )}
                      </td>
                      <td className={tableStyles.td} title={applicant.course_name ?? undefined}>
                        <span className="block font-medium">{applicant.course_code ?? "--"}</span>
                        {applicant.campus && <span className="block text-xs text-neutral-600">{applicant.campus}</span>}
                      </td>
                      <td className={tableStyles.td}>
                        {isSelected ? (
                          <span className="inline-flex rounded-full bg-[#e3e4f8] px-2.5 py-0.5 text-xs font-medium text-[#191e73]">
                            Admitting
                          </span>
                        ) : free <= 0 ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                            Full
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 tabular-nums">
                            {free === Infinity ? "No limit" : `${free} left`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500 italic">
          Ranked by exam score. Subject to available slots and university admission policies.
        </p>
      </section>

      <Modal
        open={confirming}
        onOpenChange={(open) => !isPending && setConfirming(open)}
        title="Confirm additional batch"
        description={`${selected.size} applicant${selected.size === 1 ? "" : "s"} will be admitted`}
        size="sm"
      >
        <div className="space-y-4 text-sm">
          <p className="text-neutral-700">
            They move from <span className="font-medium">Qualified</span> to{" "}
            <span className="font-medium">Passed</span>, take a slot in their course, and appear in Enrollment
            Verification.
          </p>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {byCourse.map(([course, count]) => (
              <li key={course} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium">{course}</span>
                <span className="text-neutral-700 tabular-nums">
                  {count} applicant{count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-4 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={isPending}
              className="h-9 rounded-lg bg-[#191e73] px-4 font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
            >
              {isPending ? "Admitting…" : `Admit ${selected.size}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
