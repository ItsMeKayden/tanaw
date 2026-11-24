"use client";

import { useState } from "react";
import { History, Monitor } from "lucide-react";

import {
  Avatar,
  ChangeSentence,
  InlineDiff,
  RecoveryPreview,
  changeBadge,
  timeFormat,
} from "@/components/user-management/audit-change";
import {
  ActivityDetailsModal,
  RecordHistoryModal,
  type HistoryTarget,
} from "@/components/user-management/audit-modals";
import { TONE_CLASSES, browserName, describeChange, isRecovery, tableInfo } from "@/features/audit-log/labels";
import type { AuditActivity } from "@/features/audit-log/queries";

const TZ = "Asia/Manila";
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const PREVIEW_CHANGES = 3;

function dayHeading(iso: string) {
  const key = dayKeyFormat.format(new Date(iso));
  const full = dayFormat.format(new Date(iso));
  if (key === dayKeyFormat.format(new Date())) return { key, title: "Today", sub: full };
  if (key === dayKeyFormat.format(new Date(Date.now() - 86_400_000))) return { key, title: "Yesterday", sub: full };
  return { key, title: full, sub: null };
}

/** The change that best describes a save, e.g. the applicant rather than its status log. */
function headlineOf(activity: AuditActivity) {
  return activity.changes.reduce((best, change) =>
    tableInfo(change.table_name).rank < tableInfo(best.table_name).rank ? change : best,
  );
}

function ActivityCard({
  activity,
  roleLabels,
  onDetails,
  onHistory,
}: Readonly<{
  activity: AuditActivity;
  roleLabels: Record<string, string>;
  onDetails: () => void;
  onHistory: (target: HistoryTarget) => void;
}>) {
  const headline = headlineOf(activity);
  const isEvent = headline.table_name === null && headline.action !== "TRUNCATE";
  const actor = activity.actor_name ?? activity.actor_email ?? "System";
  const role = activity.actor_role ? (roleLabels[activity.actor_role] ?? activity.actor_role) : null;
  const browser = browserName(activity.user_agent);
  const others = activity.changes.filter((c) => c !== headline);
  const moreCount = activity.total - 1 - Math.min(others.length, PREVIEW_CHANGES);
  const recovery = isRecovery(headline);
  const diffPreview = headline.action === "UPDATE" && !recovery ? headline.changed_fields.slice(0, 2) : [];

  return (
    <li className="rounded-xl border border-neutral-300 bg-white/95 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex gap-3 p-3 sm:p-4">
        <Avatar name={activity.actor_name ?? activity.actor_email} role={activity.actor_role} />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="text-sm leading-relaxed">
              <ChangeSentence change={headline} actor={actor} />
            </p>
            {changeBadge(headline)}
          </div>

          {headline.action === "LOGIN_FAILED" && headline.description && (
            <p className="text-sm text-amber-900">{headline.description}</p>
          )}

          {recovery && <RecoveryPreview change={headline} context={{ actor, occurredAt: activity.occurred_at }} />}

          {diffPreview.length > 0 && (
            <div>
              {diffPreview.map((field) => (
                <InlineDiff key={field} change={headline} field={field} />
              ))}
              {headline.changed_fields.length > diffPreview.length && (
                <p className="text-xs text-neutral-600">
                  +{headline.changed_fields.length - diffPreview.length} more field
                  {headline.changed_fields.length - diffPreview.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}

          {others.length > 0 && (
            <ul className="space-y-0.5 border-l-2 border-neutral-200 pl-3 text-sm text-neutral-800">
              {others.slice(0, PREVIEW_CHANGES).map((change) => (
                <li key={change.audit_id} className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_CLASSES[describeChange(change).tone].dot}`}
                    aria-hidden="true"
                  />
                  <span>
                    <ChangeSentence change={change} />
                  </span>
                </li>
              ))}
              {moreCount > 0 && (
                <li className="text-neutral-600">
                  and {moreCount.toLocaleString("en-US")} more change{moreCount === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-neutral-600">
            <time dateTime={activity.occurred_at} className="tabular-nums">
              {timeFormat.format(new Date(activity.occurred_at))}
            </time>
            {role && <span>{role}</span>}
            <span className="rounded bg-[#e3e4f8] px-1.5 py-0.5 text-[#191e73]">{tableInfo(headline.table_name).module}</span>
            {browser && (
              <span className="inline-flex items-center gap-1">
                <Monitor className="size-3.5" aria-hidden="true" />
                {browser}
              </span>
            )}
            {!isEvent && (
              <span className="ml-auto flex gap-1">
                {activity.changes.length === 1 && headline.table_name && headline.record_id && (
                  <button
                    type="button"
                    onClick={() =>
                      onHistory({
                        table: headline.table_name!,
                        recordId: headline.record_id!,
                        label: headline.record_label,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#191e73] hover:bg-[#e3e4f8]"
                  >
                    <History className="size-3.5" aria-hidden="true" />
                    History
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDetails}
                  className="rounded-md border border-[#191e73]/30 px-2.5 py-1 font-medium text-[#191e73] hover:bg-[#e3e4f8]"
                >
                  View details
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function AuditLogTimeline({
  activities,
  roleLabels,
}: Readonly<{ activities: AuditActivity[]; roleLabels: Record<string, string> }>) {
  const [details, setDetails] = useState<AuditActivity | null>(null);
  const [history, setHistory] = useState<{ target: HistoryTarget; from: AuditActivity | null } | null>(null);

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-400 bg-white/90 px-6 py-14 text-center">
        <History className="mx-auto size-8 text-neutral-400" aria-hidden="true" />
        <p className="mt-2 font-medium">No activity found</p>
        <p className="text-sm text-neutral-600">Try a different search, or clear the filters.</p>
      </div>
    );
  }

  const days: { key: string; title: string; sub: string | null; items: AuditActivity[] }[] = [];
  for (const activity of activities) {
    const heading = dayHeading(activity.occurred_at);
    if (days.at(-1)?.key !== heading.key) days.push({ ...heading, items: [] });
    days.at(-1)!.items.push(activity);
  }

  return (
    <>
      <div className="space-y-6">
        {days.map((day) => (
          <section key={day.key} aria-label={day.title}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-neutral-900">
              {day.title}
              {day.sub && <span className="font-normal text-neutral-600">{day.sub}</span>}
            </h2>
            <ol className="space-y-2">
              {day.items.map((activity) => (
                <ActivityCard
                  key={activity.key}
                  activity={activity}
                  roleLabels={roleLabels}
                  onDetails={() => setDetails(activity)}
                  onHistory={(target) => setHistory({ target, from: null })}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <ActivityDetailsModal
        activity={details}
        roleLabels={roleLabels}
        onClose={() => setDetails(null)}
        onOpenHistory={(target) => {
          setHistory({ target, from: details });
          setDetails(null);
        }}
      />
      <RecordHistoryModal
        target={history?.target ?? null}
        roleLabels={roleLabels}
        onClose={() => setHistory(null)}
        onBack={
          history?.from
            ? () => {
                setDetails(history.from);
                setHistory(null);
              }
            : undefined
        }
      />
    </>
  );
}
