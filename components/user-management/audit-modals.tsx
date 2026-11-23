"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Layers, Loader2 } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import {
  Avatar,
  ChangeSentence,
  ChangeTable,
  changeBadge,
  fullDateTime,
} from "@/components/user-management/audit-change";
import { loadRecordHistory } from "@/features/audit-log/actions";
import { browserName, tableInfo } from "@/features/audit-log/labels";
import type { AuditActivity, AuditChange, AuditHistoryEntry } from "@/features/audit-log/queries";

export type HistoryTarget = { table: string; recordId: string; label: string | null };

function recordName(change: Pick<AuditChange, "record_label" | "record_id">) {
  return change.record_label ?? (change.record_id ? `#${change.record_id}` : null);
}

function HistoryButton({ change, onOpen }: Readonly<{ change: AuditChange; onOpen: (t: HistoryTarget) => void }>) {
  if (!change.table_name || !change.record_id) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen({ table: change.table_name!, recordId: change.record_id!, label: recordName(change) })}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-[#191e73] hover:bg-[#e3e4f8]"
    >
      <History className="size-3.5" aria-hidden="true" />
      History
    </button>
  );
}

function Meta({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-neutral-900">{children}</dd>
    </div>
  );
}

/** Everything about one save: who, when, from where, and every field that changed. */
export function ActivityDetailsModal({
  activity,
  roleLabels,
  onClose,
  onOpenHistory,
}: Readonly<{
  activity: AuditActivity | null;
  roleLabels: Record<string, string>;
  onClose: () => void;
  onOpenHistory: (target: HistoryTarget) => void;
}>) {
  const actor = activity ? (activity.actor_name ?? activity.actor_email ?? "System") : "";
  const role = activity?.actor_role ? (roleLabels[activity.actor_role] ?? activity.actor_role) : null;
  const modules = activity ? [...new Set(activity.changes.map((c) => tableInfo(c.table_name).module))] : [];

  return (
    <Modal
      open={activity !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Activity details"
      description={activity ? fullDateTime.format(new Date(activity.occurred_at)) : undefined}
    >
      {activity && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
              <Avatar name={activity.actor_name ?? activity.actor_email} role={activity.actor_role} />
              <Meta label="Done by">
                <span className="font-semibold">{actor}</span>
                {activity.actor_email && activity.actor_name && (
                  <span className="block text-xs text-neutral-600">{activity.actor_email}</span>
                )}
              </Meta>
            </div>
            <Meta label="Role">{role ?? (activity.actor_name ? "—" : "No signed-in user (script or database)")}</Meta>
            <Meta label="When">{fullDateTime.format(new Date(activity.occurred_at))}</Meta>
            <Meta label="Module">{modules.join(", ")}</Meta>
            <Meta label="Device">{browserName(activity.user_agent) ?? "—"}</Meta>
            <Meta label="Changes">
              {activity.total.toLocaleString("en-US")} record{activity.total === 1 ? "" : "s"}
            </Meta>
          </dl>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900">What changed</h3>
            <ol className="space-y-4">
              {activity.changes.map((change) => (
                <li key={change.audit_id} className="space-y-3 rounded-xl border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {changeBadge(change)}
                        <span className="text-xs text-neutral-500">{tableInfo(change.table_name).label}</span>
                      </div>
                      <p className="text-sm">
                        <ChangeSentence change={change} />
                      </p>
                      {change.description && <p className="text-sm text-neutral-700">{change.description}</p>}
                    </div>
                    <HistoryButton change={change} onOpen={onOpenHistory} />
                  </div>
                  <ChangeTable change={change} context={{ actor, occurredAt: activity.occurred_at }} />
                </li>
              ))}
            </ol>
            {activity.total > activity.changes.length && activity.transaction_id && (
              <Link
                href={`/user-management/audit-log?tx=${activity.transaction_id}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-sm font-medium text-[#191e73] hover:underline"
              >
                <Layers className="size-4" aria-hidden="true" />
                Showing {activity.changes.length} of {activity.total.toLocaleString("en-US")} — open the full list
              </Link>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

type HistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: AuditHistoryEntry[]; truncated: boolean };

/** Every logged change of one record, newest first, as a timeline. */
export function RecordHistoryModal({
  target,
  roleLabels,
  onClose,
  onBack,
}: Readonly<{
  target: HistoryTarget | null;
  roleLabels: Record<string, string>;
  onClose: () => void;
  /** Shown when the history was opened from the details modal. */
  onBack?: () => void;
}>) {
  // Results are kept with the record they belong to; until the current
  // record's result arrives, the modal shows "loading".
  const [loaded, setLoaded] = useState<{ target: HistoryTarget; state: HistoryState } | null>(null);
  const state: HistoryState = loaded && loaded.target === target ? loaded.state : { status: "loading" };

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    loadRecordHistory(target.table, target.recordId)
      .then((result) => {
        if (cancelled) return;
        setLoaded({
          target,
          state: "error" in result ? { status: "error", message: result.error } : { status: "ready", ...result },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ target, state: { status: "error", message: "Could not load the history. Try again." } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const kind = target ? tableInfo(target.table).label : "";

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`${kind} history`}
      description={target?.label ?? undefined}
    >
      {target && (
        <div className="space-y-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#191e73] hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to activity details
            </button>
          )}

          {state.status === "loading" && (
            <p className="flex items-center gap-2 py-10 text-sm text-neutral-600" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading history…
            </p>
          )}
          {state.status === "error" && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {state.message}
            </p>
          )}
          {state.status === "ready" && state.entries.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-600">No changes have been logged for this record.</p>
          )}
          {state.status === "ready" && state.entries.length > 0 && (
            <>
              <p className="text-sm text-neutral-600">
                {state.entries.length} change{state.entries.length === 1 ? "" : "s"} logged
                {state.truncated ? " (showing the most recent)" : ""}, newest first.
              </p>
              <ol className="space-y-6">
                {state.entries.map((entry, index) => {
                  const actor = entry.actor_name ?? entry.actor_email ?? "System";
                  const role = entry.actor_role ? (roleLabels[entry.actor_role] ?? entry.actor_role) : null;
                  const last = index === state.entries.length - 1;
                  return (
                    <li key={entry.audit_id} className="relative flex gap-4">
                      {/* Line joining this step to the next one. */}
                      {!last && (
                        <span
                          className="absolute top-12 -bottom-4 left-5 w-px -translate-x-1/2 bg-neutral-300"
                          aria-hidden="true"
                        />
                      )}
                      <Avatar name={entry.actor_name ?? entry.actor_email} role={entry.actor_role} />
                      <div className="min-w-0 flex-1 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm leading-relaxed">
                              <ChangeSentence change={entry} actor={actor} />
                            </p>
                            <p className="text-xs text-neutral-600">
                              {fullDateTime.format(new Date(entry.occurred_at))}
                              {role ? ` · ${role}` : ""}
                            </p>
                          </div>
                          {changeBadge(entry)}
                        </div>
                        <ChangeTable change={entry} context={{ actor, occurredAt: entry.occurred_at }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
