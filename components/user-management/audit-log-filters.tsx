"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Layers, ListFilter, Loader2, Search, UserRound, X, Zap } from "lucide-react";

import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_TABLES, tableInfo } from "@/features/audit-log/labels";

export type AuditFilterValues = {
  q?: string;
  actor?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  table?: string;
  record?: string;
  tx?: string;
};

type Key = keyof AuditFilterValues;
const KEYS: Key[] = ["q", "actor", "module", "action", "from", "to", "table", "record", "tx"];
const BASE = "/user-management/audit-log";

const selectClass =
  "h-9 w-full appearance-none rounded-lg border border-neutral-300 bg-white pr-8 pl-9 text-sm text-neutral-900 outline-none hover:border-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const dateClass =
  "h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

const dateLabel = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatDay = (value: string) => dateLabel.format(new Date(`${value}T00:00:00Z`));

/** A select with a leading icon and a chevron, labelled for screen readers. */
function IconSelect({
  label,
  icon: Icon,
  value,
  onChange,
  children,
}: Readonly<{
  label: string;
  icon: typeof Search;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}>) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Icon
        className={`pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 ${value ? "text-[#191e73]" : "text-neutral-500"}`}
        aria-hidden="true"
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${selectClass} ${value ? "border-[#191e73]/50 bg-[#f4f5fd] font-medium" : ""}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-neutral-500"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export function AuditLogFilterBar({
  values,
  actors,
  today,
  presets,
  total,
}: Readonly<{
  values: AuditFilterValues;
  actors: { value: string; label: string }[];
  today: string;
  presets: { label: string; from: string }[];
  /** Activities matching the current filters. */
  total: number;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(values.q ?? "");

  const activePreset = !values.to ? presets.find((preset) => preset.from === values.from) : undefined;
  const hasDates = Boolean(values.from || values.to);
  const [customDates, setCustomDates] = useState(hasDates && !activePreset);

  function apply(changes: Partial<AuditFilterValues>) {
    const next = new URLSearchParams();
    for (const key of KEYS) {
      const value = key in changes ? changes[key] : values[key];
      if (value) next.set(key, value);
    }
    const text = next.toString();
    // Any filter change starts again from page 1.
    startTransition(() => router.replace(text ? `${BASE}?${text}` : BASE, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if (query.trim() === (values.q ?? "")) return;
    const timer = setTimeout(() => apply({ q: query.trim() || undefined }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `apply` only reads the current values.
  }, [query]);

  const actorLabel = (value: string) =>
    value === "system" ? "System" : (actors.find((actor) => actor.value === value)?.label ?? `User #${value}`);
  const moduleLabel = (value: string) =>
    value in AUDIT_TABLES ? `${tableInfo(value).module} › ${tableInfo(value).label}` : value;

  const chips: { label: string; clear: Partial<AuditFilterValues> }[] = [];
  if (values.q) chips.push({ label: `“${values.q}”`, clear: { q: undefined } });
  if (values.actor) chips.push({ label: `User: ${actorLabel(values.actor)}`, clear: { actor: undefined } });
  if (values.module) chips.push({ label: `Module: ${moduleLabel(values.module)}`, clear: { module: undefined } });
  if (values.action) {
    chips.push({
      label: `Action: ${AUDIT_ACTIONS[values.action as keyof typeof AUDIT_ACTIONS]?.label ?? values.action}`,
      clear: { action: undefined },
    });
  }
  if (hasDates) {
    const label = activePreset
      ? activePreset.label
      : values.from && values.to
        ? values.from === values.to
          ? formatDay(values.from)
          : `${formatDay(values.from)} – ${formatDay(values.to)}`
        : values.from
          ? `From ${formatDay(values.from)}`
          : `Until ${formatDay(values.to!)}`;
    chips.push({ label: `Date: ${label}`, clear: { from: undefined, to: undefined } });
  }

  const segment = (active: boolean) =>
    `inline-flex h-8 items-center rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors ${
      active ? "bg-white text-[#191e73] shadow-sm ring-1 ring-neutral-300" : "text-neutral-600 hover:text-neutral-900"
    }`;

  return (
    <section
      aria-label="Filter the audit log"
      className="space-y-3 rounded-xl border border-neutral-400 bg-white/90 p-4"
      aria-busy={pending}
    >
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block md:col-span-2 xl:col-span-1">
          <span className="sr-only">Search</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply({ q: query.trim() || undefined });
            }}
            placeholder="Search names, application no., emails, or any value…"
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white pr-3 pl-9 text-sm outline-none hover:border-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20 [&::-webkit-search-cancel-button]:cursor-pointer"
          />
        </label>

        <IconSelect label="User" icon={UserRound} value={values.actor ?? ""} onChange={(v) => apply({ actor: v || undefined })}>
          <option value="">All users</option>
          <option value="system">System (no signed-in user)</option>
          {actors.map((actor) => (
            <option key={actor.value} value={actor.value}>
              {actor.label}
            </option>
          ))}
        </IconSelect>

        <IconSelect label="Module" icon={Layers} value={values.module ?? ""} onChange={(v) => apply({ module: v || undefined })}>
          <option value="">All modules</option>
          {AUDIT_MODULES.filter((module) => module !== "Other").map((module) => (
            <optgroup key={module} label={module}>
              <option value={module}>All of {module}</option>
              {Object.entries(AUDIT_TABLES)
                .filter(([, info]) => info.module === module)
                .sort((a, b) => a[1].label.localeCompare(b[1].label))
                .map(([table, info]) => (
                  <option key={table} value={table}>
                    {info.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </IconSelect>

        <IconSelect label="Action" icon={Zap} value={values.action ?? ""} onChange={(v) => apply({ action: v || undefined })}>
          <option value="">All actions</option>
          {Object.entries(AUDIT_ACTIONS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </IconSelect>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="size-4 text-neutral-500" aria-hidden="true" />
        <div role="group" aria-label="Date range" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-neutral-100 p-0.5">
          <button
            type="button"
            className={segment(!hasDates && !customDates)}
            aria-pressed={!hasDates && !customDates}
            onClick={() => {
              setCustomDates(false);
              apply({ from: undefined, to: undefined });
            }}
          >
            Any time
          </button>
          {presets.map((preset) => {
            const active = activePreset?.label === preset.label && !customDates;
            return (
              <button
                key={preset.label}
                type="button"
                className={segment(active)}
                aria-pressed={active}
                onClick={() => {
                  setCustomDates(false);
                  apply({ from: preset.from, to: undefined });
                }}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            className={segment(customDates)}
            aria-pressed={customDates}
            onClick={() => setCustomDates(true)}
          >
            Custom
          </button>
        </div>

        {customDates && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
            <label className="flex items-center gap-1.5">
              From
              <input
                type="date"
                value={values.from ?? ""}
                max={values.to || today}
                onChange={(event) => apply({ from: event.target.value || undefined })}
                className={dateClass}
              />
            </label>
            <label className="flex items-center gap-1.5">
              to
              <input
                type="date"
                value={values.to ?? ""}
                min={values.from || undefined}
                max={today}
                onChange={(event) => apply({ to: event.target.value || undefined })}
                className={dateClass}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3">
        <p className="mr-1 inline-flex items-center gap-1.5 text-sm text-neutral-700" role="status">
          {pending ? (
            <Loader2 className="size-4 animate-spin text-[#191e73]" aria-hidden="true" />
          ) : (
            <ListFilter className="size-4 text-neutral-500" aria-hidden="true" />
          )}
          <span>
            <span className="font-semibold text-neutral-900 tabular-nums">{total.toLocaleString("en-US")}</span>{" "}
            {total === 1 ? "activity" : "activities"}
            {chips.length > 0 ? " match" : ""}
          </span>
        </p>

        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              if ("q" in chip.clear) setQuery("");
              if ("from" in chip.clear) setCustomDates(false);
              apply(chip.clear);
            }}
            className="group inline-flex max-w-full items-center gap-1 rounded-full border border-[#191e73]/25 bg-[#e3e4f8] py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-[#191e73] hover:border-[#191e73]/50"
            aria-label={`Remove filter ${chip.label}`}
          >
            <span className="truncate">{chip.label}</span>
            <X className="size-3.5 shrink-0 rounded-full group-hover:bg-[#191e73] group-hover:text-white" aria-hidden="true" />
          </button>
        ))}

        {chips.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCustomDates(false);
              apply({ q: undefined, actor: undefined, module: undefined, action: undefined, from: undefined, to: undefined });
            }}
            className="text-xs font-medium text-neutral-600 underline-offset-2 hover:text-[#191e73] hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </section>
  );
}
