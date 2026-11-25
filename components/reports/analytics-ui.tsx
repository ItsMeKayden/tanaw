import { Lightbulb, TrendingUp, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { AutoSubmitSelect } from "@/components/reports/auto-submit-select";
import { ExportMenu } from "@/components/reports/export-menu";
import type { Insight, InsightTone } from "@/features/reports/overview-insights";

/**
 * Chart colors, validated together for color-blind safety (dataviz
 * validate_palette, light surface). "failed" sits just under 3:1 contrast,
 * so every chart using it also prints the figures as text.
 */
export const CHART_COLORS = {
  passed: "#1f4a9f",
  waitlisted: "#d97706",
  failed: "#5598e7",
  /** Second line in a two-series chart (pairs with "passed" blue). */
  secondary: "#eb6834",
} as const;

const fmt = (value: number) => value.toLocaleString("en-US");

export function AnalyticsPage({
  title,
  children,
}: Readonly<{ title?: string; children: ReactNode }>) {
  return (
    <div className="min-h-full bg-neutral-50 p-3 sm:p-5">
      {title && <h1 className="mb-3 text-xl font-bold">{title}</h1>}
      {children}
    </div>
  );
}

export function AnalyticsCard({
  title,
  description,
  insight,
  className = "",
  children,
}: Readonly<{
  title?: string;
  description?: string;
  /** Shown pinned to the bottom of the card, so cards in a row stay aligned. */
  insight?: Insight | null;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <section className={`flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || description) && (
        <header className="mb-4">
          {title && <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
        </header>
      )}
      {/* A flex column, so content such as <MeterList fill> can grow into the card's spare height. */}
      <div className="flex flex-1 flex-col">{children}</div>
      {insight ? <InsightNote insight={insight} /> : null}
    </section>
  );
}

const INSIGHT_STYLES: Record<InsightTone, { box: string; icon: ReactNode; label: string }> = {
  positive: { box: "bg-emerald-50 text-emerald-900 ring-emerald-200", icon: <TrendingUp />, label: "Good sign" },
  attention: { box: "bg-amber-50 text-amber-950 ring-amber-200", icon: <TriangleAlert />, label: "Needs attention" },
  neutral: { box: "bg-[#eef0fa] text-[#191e73] ring-[#191e73]/15", icon: <Lightbulb />, label: "Insight" },
};

/** One plain-language takeaway, with an icon and a screen-reader label for its tone. */
export function InsightNote({ insight }: Readonly<{ insight: Insight }>) {
  const style = INSIGHT_STYLES[insight.tone];
  return (
    <p className={`mt-4 flex gap-2.5 rounded-lg px-3 py-2.5 text-sm leading-snug ring-1 ring-inset ${style.box}`}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden="true">{style.icon}</span>
      <span>
        <span className="sr-only">{style.label}: </span>
        {insight.text}
      </span>
    </p>
  );
}

export function SelectFilter({
  name,
  label,
  value,
  options,
}: Readonly<{ name: string; label: string; value: string; options: { value: string; label: string }[] }>) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm shadow-xs focus-within:border-[#191e73]">
      <span className="text-neutral-500">{label}</span>
      <AutoSubmitSelect name={name} defaultValue={value} className="border-0 bg-transparent pr-1 font-medium text-neutral-900 outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </AutoSubmitSelect>
    </label>
  );
}

/** Filters apply as soon as a dropdown changes; the Apply button only shows without JavaScript. */
export function FilterBar({
  action,
  exportHref,
  children,
}: Readonly<{ action: string; exportHref?: string; children: ReactNode }>) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {children}
      <noscript>
        <button type="submit" className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold">
          Apply
        </button>
      </noscript>
      {exportHref ? (
        <div className="ml-auto">
          <ExportMenu href={exportHref} primary />
        </div>
      ) : null}
    </form>
  );
}

/** A headline number with an optional change against the previous school year. */
export function StatTile({
  label,
  value,
  note,
  delta,
  icon,
}: Readonly<{
  label: string;
  value: string;
  note?: string;
  /** Change vs last year; `unit` is printed after the number (e.g. " pts"). */
  delta?: { value: number; unit: string; against: string } | null;
  /** A small lucide icon, e.g. <Users />; sized and colored by the tile. */
  icon?: ReactNode;
}>) {
  const up = delta && delta.value > 0;
  const down = delta && delta.value < 0;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        {icon ? (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eef0fa] text-[#191e73] [&_svg]:size-[18px]"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className={`${icon ? "-mt-2" : "mt-1"} text-3xl font-semibold tracking-tight text-neutral-900 tabular-nums`}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
        {delta ? (
          <span className={`font-medium tabular-nums ${up ? "text-emerald-700" : down ? "text-red-700" : "text-neutral-600"}`}>
            <span aria-hidden="true">{up ? "▲" : down ? "▼" : "■"}</span>{" "}
            {up ? "+" : ""}
            {delta.value.toFixed(1)}
            {delta.unit}
            <span className="sr-only">{up ? " increase" : down ? " decrease" : " no change"}</span>
            <span className="font-normal text-neutral-500"> vs {delta.against}</span>
          </span>
        ) : null}
        {note ? <span>{note}</span> : null}
      </div>
    </div>
  );
}

export function ChartLegend({ items }: Readonly<{ items: { label: string; color: string }[] }>) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function EmptyChart({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="flex min-h-32 flex-1 items-center justify-center py-8 text-center text-sm text-neutral-500">{children}</p>;
}

/**
 * Rows of name, bar and figure: one bar per row against a shared maximum.
 * With `fill`, the rows spread out to use the card's spare height instead of
 * leaving a gap under them when a taller card sits beside this one.
 */
export function MeterList({
  rows,
  max,
  color = CHART_COLORS.passed,
  fill = false,
}: Readonly<{
  rows: { label: string; value: number; figure: string; note?: string; detail?: string }[];
  max: number;
  color?: string;
  fill?: boolean;
}>) {
  const scale = max > 0 ? max : 1;
  return (
    <ul className={fill ? "flex flex-1 flex-col justify-around gap-4" : "space-y-3"}>
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${row.figure}${row.note ? ` (${row.note})` : ""}${row.detail ? `. ${row.detail}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-neutral-700">{row.label}</span>
            <span className="shrink-0 font-semibold text-neutral-900 tabular-nums">
              {row.figure}
              {row.note ? <span className="ml-1.5 text-xs font-normal text-neutral-500">{row.note}</span> : null}
            </span>
          </div>
          <div className={`${fill ? "h-2.5" : "h-2"} rounded-full bg-neutral-100`}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, (row.value / scale) * 100))}%`, background: color }}
            />
          </div>
          {row.detail ? <p className="mt-1 text-xs text-neutral-500">{row.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** One whole split into parts: a tall bar plus a legend that lists each part's count and share. */
export function SegmentedBar({
  parts,
  unit,
}: Readonly<{ parts: { label: string; value: number; color: string }[]; unit: string }>) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total === 0) return <EmptyChart>No exam results yet.</EmptyChart>;
  return (
    <div>
      <div className="flex h-10 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts
          .filter((part) => part.value > 0)
          .map((part) => {
            const share = (part.value / total) * 100;
            return (
              <div
                key={part.label}
                className="flex items-center justify-center text-xs font-semibold text-white"
                style={{ width: `${share}%`, background: part.color }}
                title={`${part.label}: ${fmt(part.value)} ${unit} (${share.toFixed(1)}%)`}
              >
                {share >= 12 ? `${Math.round(share)}%` : null}
              </div>
            );
          })}
      </div>
      <ul className="mt-4 divide-y divide-neutral-100 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between py-2">
            <span className="inline-flex items-center gap-2 text-neutral-700">
              <span className="size-2.5 rounded-sm" style={{ background: part.color }} aria-hidden="true" />
              {part.label}
            </span>
            <span className="tabular-nums">
              <span className="font-semibold text-neutral-900">{fmt(part.value)}</span>
              <span className="ml-2 inline-block w-14 text-right text-xs text-neutral-500">
                {((part.value / total) * 100).toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked columns sharing one count axis, e.g. examinees per score range split by result. */
export function StackedColumns({
  bins,
  series,
  xLabel,
}: Readonly<{
  bins: { label: string; values: Record<string, number> }[];
  series: { key: string; label: string; color: string }[];
  xLabel: string;
}>) {
  const totals = bins.map((bin) => series.reduce((sum, s) => sum + (bin.values[s.key] ?? 0), 0));
  const peak = Math.max(0, ...totals);
  if (peak === 0) return <EmptyChart>No exam scores yet.</EmptyChart>;
  const step = Math.max(1, Math.ceil(peak / 4));
  const ceiling = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);

  return (
    <div>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative h-52 w-8 shrink-0 text-right text-[11px] text-neutral-500 tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(tick / ceiling) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="relative h-52 flex-1">
          {ticks.map((tick) => (
            <div key={tick} className="absolute inset-x-0 border-t border-neutral-200" style={{ bottom: `${(tick / ceiling) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1.5">
            {bins.map((bin, index) => (
              <div
                key={bin.label}
                className="flex h-full flex-1 flex-col-reverse gap-[2px]"
                title={`${bin.label}: ${series.map((s) => `${s.label} ${bin.values[s.key] ?? 0}`).join(", ")}`}
              >
                {series.map((s, segment) => {
                  const value = bin.values[s.key] ?? 0;
                  if (!value) return null;
                  const isTop = series.slice(segment + 1).every((next) => !(bin.values[next.key] ?? 0));
                  return (
                    <div
                      key={s.key}
                      className={isTop ? "rounded-t-[4px]" : undefined}
                      style={{ height: `${(value / ceiling) * 100}%`, background: s.color }}
                    />
                  );
                })}
                <span className="sr-only">{`${bin.label}: ${totals[index]}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-10 mt-1 flex gap-[2px] text-center text-[11px] text-neutral-500 sm:gap-1.5">
        {bins.map((bin) => (
          <span key={bin.label} className="flex-1 truncate">{bin.label}</span>
        ))}
      </div>
      <p className="ml-10 mt-1 text-center text-[11px] text-neutral-500">{xLabel}</p>
    </div>
  );
}

/** Lines over school years on one 0–100 axis; each series is labeled at its last point. */
export function TrendChart({
  labels,
  series,
  max = 100,
}: Readonly<{
  labels: string[];
  series: { label: string; color: string; values: (number | null)[]; format: (value: number) => string }[];
  max?: number;
}>) {
  if (labels.length === 0 || series.every((s) => s.values.every((v) => v === null))) {
    return <EmptyChart>No exam results in recent school years.</EmptyChart>;
  }
  const width = 560;
  const height = 230;
  const left = 34;
  const right = 64;
  const top = 12;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (index: number) => (labels.length > 1 ? left + (plotW * index) / (labels.length - 1) : left + plotW / 2);
  const y = (value: number) => top + plotH - (Math.min(value, max) / max) * plotH;

  // End-of-line labels, pushed apart so close values don't overlap.
  const endLabels = series
    .map((s) => {
      const index = s.values.findLastIndex((value) => value !== null);
      return index < 0 ? null : { key: s.label, x: x(index) + 10, y: y(s.values[index]!) + 4, text: s.format(s.values[index]!) };
    })
    .filter((label): label is NonNullable<typeof label> => label !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + 14);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(" and ") + " by school year"}>
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#e5e5e5" />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#737373">{tick}</text>
        </g>
      ))}
      {labels.map((label, index) => (
        <text key={label} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#737373">{label}</text>
      ))}
      {series.map((s) => {
        const points = s.values
          .map((value, index) => (value === null ? null : { index, value }))
          .filter((point): point is { index: number; value: number } => point !== null);
        const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.index)} ${y(p.value)}`).join(" ");
        return (
          <g key={s.label}>
            {points.length > 1 && <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />}
            {points.map((p) => (
              <g key={p.index}>
                <circle cx={x(p.index)} cy={y(p.value)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
                {/* larger invisible hit target for the tooltip */}
                <circle cx={x(p.index)} cy={y(p.value)} r="12" fill="transparent">
                  <title>{`${labels[p.index]} · ${s.label}: ${s.format(p.value)}`}</title>
                </circle>
              </g>
            ))}
          </g>
        );
      })}
      {endLabels.map((label) => (
        <text key={label.key} x={label.x} y={label.y} fontSize="11" fontWeight="600" fill="#404040">
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function DonutChart({
  passed,
  failed,
  title,
}: Readonly<{ passed: number; failed: number; title: string }>) {
  const total = passed + failed;
  const passedPct = total ? (passed / total) * 100 : 0;
  const failedPct = total ? (failed / total) * 100 : 0;
  return (
    <div>
      {title && <p className="mb-2 text-center text-xs font-semibold">{title}</p>}
      <div className="flex items-center justify-center gap-5">
        <div
          className="relative size-[180px] rounded-full"
          style={{ background: `conic-gradient(#1f4a9f 0 ${passedPct}%, #93baf4 ${passedPct}% 100%)` }}
        >
          <div className="absolute inset-[34px] flex flex-col items-center justify-center rounded-full bg-white text-center">
            <strong className="text-base">{total.toLocaleString()}</strong>
            <span className="text-xs">examinees</span>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div><span className="mr-2 inline-block size-3 bg-[#1f4a9f]" />Passed: {passed.toLocaleString()} ({passedPct.toFixed(1)}%)</div>
          <div><span className="mr-2 inline-block size-3 bg-[#93baf4]" />Failed: {failed.toLocaleString()} ({failedPct.toFixed(1)}%)</div>
        </div>
      </div>
    </div>
  );
}

export function LineChart({
  points,
  title,
}: Readonly<{ points: { label: string; value: number }[]; title: string }>) {
  const max = 100;
  const width = 420;
  const height = 190;
  const left = 45;
  const right = 12;
  const top = 20;
  const bottom = 35;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: left + step * index,
    y: top + plotH - (point.value / max) * plotH,
    ...point,
  }));
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  return (
    <div>
      <p className="mb-1 text-center text-xs font-semibold">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label={title}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = top + plotH - (tick / max) * plotH;
          return <g key={tick}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 4" /><text x={left-8} y={y+3} textAnchor="end" fontSize="9" fill="#4b5563">{tick}</text></g>;
        })}
        <line x1={left} x2={left} y1={top} y2={top+plotH} stroke="#374151" />
        <line x1={left} x2={width-right} y1={top+plotH} y2={top+plotH} stroke="#374151" />
        {coords.length > 1 && <path d={path} fill="none" stroke="#1f4a9f" strokeWidth="2.5" />}
        {coords.map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="4" fill="#1f4a9f" /><text x={point.x} y={point.y-8} textAnchor="middle" fontSize="8" fill="#111827">{point.value.toFixed(1)}%</text><text x={point.x} y={height-8} textAnchor="middle" fontSize="8" fill="#374151">{point.label}</text></g>)}
      </svg>
    </div>
  );
}

export function HorizontalBars({
  items,
  title,
  max = 100,
}: Readonly<{ items: { label: string; value: number }[]; title: string; max?: number }>) {
  return (
    <div>
      {title && <p className="mb-3 text-center text-xs font-semibold">{title}</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[120px_1fr_42px] items-center gap-2 text-xs">
            <span className="truncate text-right">{item.label}</span>
            <div className="h-5 bg-neutral-100"><div className="h-full bg-[#1f4a9f]" style={{ width: `${Math.max(0, Math.min(100, (item.value / max) * 100))}%` }} /></div>
            <span>{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VerticalBars({
  items,
  title,
}: Readonly<{ items: { label: string; publicValue: number; privateValue: number }[]; title: string }>) {
  const max = Math.max(1, ...items.flatMap((item) => [item.publicValue, item.privateValue])) * 1.15;
  const width = 430;
  const height = 210;
  const base = 170;
  const left = 50;
  const slot = (width - left - 20) / Math.max(items.length, 1);
  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label={title}>
        {[0, .25, .5, .75, 1].map((tick) => { const y=base-tick*(base-20); return <g key={tick}><line x1={left} x2={width-10} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 4" /><text x={left-8} y={y+3} textAnchor="end" fontSize="8">{Math.round(max*tick)}</text></g>; })}
        {items.map((item,index) => { const x=left+index*slot+18; const ph=(item.publicValue/max)*(base-20); const pr=(item.privateValue/max)*(base-20); return <g key={item.label}><rect x={x} y={base-ph} width="28" height={ph} fill="#1f4a9f"/><rect x={x+31} y={base-pr} width="28" height={pr} fill="#93baf4"/><text x={x+29} y={base+14} textAnchor="middle" fontSize="8">{item.label}</text><text x={x+14} y={base-ph-4} textAnchor="middle" fontSize="7">{item.publicValue}</text><text x={x+45} y={base-pr-4} textAnchor="middle" fontSize="7">{item.privateValue}</text></g>; })}
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-xs"><span><i className="mr-1 inline-block size-3 bg-[#1f4a9f]" />Public</span><span><i className="mr-1 inline-block size-3 bg-[#93baf4]" />Private</span></div>
    </div>
  );
}

export function ScoreHistogram({
  items,
  title,
}: Readonly<{ items: { label: string; privateValue: number; publicValue: number }[]; title: string }>) {
  const max = Math.max(1, ...items.map((item) => item.privateValue + item.publicValue));
  const width = 430;
  const height = 210;
  const base = 170;
  const left = 42;
  const slot = (width - left - 18) / Math.max(items.length, 1);
  const ceiling = Math.ceil(max / 100) * 100 || 100;

  return (
    <div>
      {title && <p className="mb-2 text-center text-xs font-semibold">{title}</p>}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = base - tick * (base - 20);
          return <g key={tick}><line x1={left} x2={width - 10} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 4" /><text x={left - 7} y={y + 3} textAnchor="end" fontSize="8">{Math.round(ceiling * tick)}</text></g>;
        })}
        {items.map((item, index) => {
          const x = left + index * slot + 3;
          const belowHeight = (item.privateValue / ceiling) * (base - 20);
          const passedHeight = (item.publicValue / ceiling) * (base - 20);
          const barWidth = Math.max(20, slot - 5);
          return <g key={item.label}>
            <rect x={x} y={base - belowHeight} width={barWidth} height={belowHeight} fill="#93baf4" />
            <rect x={x} y={base - belowHeight - passedHeight} width={barWidth} height={passedHeight} fill="#1f4a9f" />
            <text x={x + barWidth / 2} y={base + 14} textAnchor="middle" fontSize="8">{item.label}</text>
            {(item.privateValue + item.publicValue) > 0 && <text x={x + barWidth / 2} y={base - belowHeight - passedHeight - 4} textAnchor="middle" fontSize="7">{item.privateValue + item.publicValue}</text>}
          </g>;
        })}
        <text x={left + (width - left) / 2} y={height - 1} textAnchor="middle" fontSize="8">Exam score</text>
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-xs"><span><i className="mr-1 inline-block size-3 bg-[#93baf4]" />Below passing score</span><span><i className="mr-1 inline-block size-3 bg-[#1f4a9f]" />Passed</span></div>
    </div>
  );
}
