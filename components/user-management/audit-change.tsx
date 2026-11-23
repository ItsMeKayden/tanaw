// Building blocks shared by the Audit Log cards, details and history modals.
import { ArrowRight } from "lucide-react";

import type { AuditChange } from "@/features/audit-log/queries";
import {
  ROLE_COLORS,
  TONE_CLASSES,
  describeChange,
  fieldLabel,
  formatValue,
  initials,
  isIdField,
  isRecovery,
  refName,
  type Tone,
} from "@/features/audit-log/labels";

const TZ = "Asia/Manila";
export const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fullDateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export function Badge({ tone, children }: Readonly<{ tone: Tone; children: React.ReactNode }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone].badge}`}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  role,
  size = "md",
}: Readonly<{ name: string | null; role: string | null; size?: "sm" | "md" }>) {
  const color = role ? (ROLE_COLORS[role] ?? "bg-neutral-600 text-white") : "bg-neutral-200 text-neutral-700";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${color} ${
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm"
      }`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

/** "<actor> gave Registrar write access to Recommendation" (actor optional). */
export function ChangeSentence({ change, actor }: Readonly<{ change: AuditChange; actor?: string }>) {
  const d = describeChange(change);
  const verb = actor ? d.verb : d.verb.charAt(0).toUpperCase() + d.verb.slice(1);
  return (
    <>
      {actor && <span className="font-semibold">{actor} </span>}
      {verb}
      {d.subject && <span className="font-semibold"> {d.subject}</span>}
      {d.suffix}
    </>
  );
}

/** Fields worth showing for a change, in display order. */
export function visibleFields(change: AuditChange) {
  if (change.action === "UPDATE") return change.changed_fields;
  const data = change.new_data ?? change.old_data ?? {};
  return Object.keys(data).filter((field) => {
    const value = data[field];
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return false;
    // Raw IDs add nothing unless they name a linked record.
    return !isIdField(field) || Boolean(refName(change, field, value));
  });
}

export function valueText(change: AuditChange, field: string, side: "old" | "new") {
  const value = (side === "old" ? change.old_data : change.new_data)?.[field];
  return formatValue(value, refName(change, field, value));
}

/** Compact "Field: old → new" line, used on the cards. */
export function InlineDiff({ change, field }: Readonly<{ change: AuditChange; field: string }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-sm">
      <span className="text-xs font-medium text-neutral-600">{fieldLabel(field)}</span>
      <span className="rounded bg-red-50 px-1.5 py-0.5 break-all text-red-900 line-through decoration-red-300">
        {valueText(change, field, "old")}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      <span className="rounded bg-green-50 px-1.5 py-0.5 break-all text-green-900">{valueText(change, field, "new")}</span>
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold tracking-wide text-neutral-600 uppercase";
const td = "px-3 py-2 align-top break-words";

/** Who made a change and when, for wording like "Recovered by". */
export type ChangeContext = { actor: string; occurredAt: string };

/** Rows for an applicant recovered from Archive History. */
function recoveryRows(change: AuditChange, context?: ChangeContext): [string, string][] {
  const rows: [string, string][] = [];
  if (context) {
    rows.push(["Recovered by", context.actor], ["Recovered on", fullDateTime.format(new Date(context.occurredAt))]);
  }
  rows.push(
    ["Archived by", valueText(change, "archived_by", "old")],
    ["Archived on", valueText(change, "archived_at", "old")],
  );
  return rows;
}

/** "Recovered by System Admin · archived by … on …", used on the cards. */
export function RecoveryPreview({ change, context }: Readonly<{ change: AuditChange; context: ChangeContext }>) {
  return (
    <p className="text-sm text-neutral-700">
      <span className="font-medium text-green-800">Recovered by {context.actor}</span>
      <span className="text-neutral-500"> · </span>
      had been archived by {valueText(change, "archived_by", "old")} on {valueText(change, "archived_at", "old")}
    </p>
  );
}

/** Full field table of a change: Before/After for edits, Value for creations and deletions. */
export function ChangeTable({ change, context }: Readonly<{ change: AuditChange; context?: ChangeContext }>) {
  if (isRecovery(change)) {
    return (
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col />
          </colgroup>
          <tbody className="divide-y divide-neutral-100">
            {recoveryRows(change, context).map(([label, value]) => (
              <tr key={label}>
                <td className={`${td} font-medium text-neutral-800`}>{label}</td>
                <td className={`${td} ${label.startsWith("Recovered") ? "bg-green-50/60 text-green-900" : ""}`}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const fields = visibleFields(change);
  if (fields.length === 0) return null;

  if (change.action === "UPDATE") {
    return (
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col />
            <col />
          </colgroup>
          <thead className="bg-neutral-50">
            <tr>
              <th className={th}>Field</th>
              <th className={th}>Before</th>
              <th className={th}>After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {fields.map((field) => (
              <tr key={field}>
                <td className={`${td} font-medium text-neutral-800`}>{fieldLabel(field)}</td>
                <td className={`${td} bg-red-50/60 text-red-900`}>{valueText(change, field, "old")}</td>
                <td className={`${td} bg-green-50/60 text-green-900`}>{valueText(change, field, "new")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const side = change.action === "DELETE" ? "old" : "new";
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[28%]" />
          <col />
        </colgroup>
        <thead className="bg-neutral-50">
          <tr>
            <th className={th}>Field</th>
            <th className={th}>{change.action === "DELETE" ? "Value when deleted" : "Value"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {fields.map((field) => (
            <tr key={field}>
              <td className={`${td} font-medium text-neutral-800`}>{fieldLabel(field)}</td>
              <td className={td}>{valueText(change, field, side)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function changeBadge(change: AuditChange) {
  const d = describeChange(change);
  return <Badge tone={d.tone}>{d.badge}</Badge>;
}
