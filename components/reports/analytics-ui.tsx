import { Lightbulb, TrendingUp, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { ExportMenu } from "@/components/reports/export-menu";

export function AnalyticsPage({
  title,
  children,
}: Readonly<{ title?: string; children: ReactNode }>) {
  return (
    <div className="min-h-full bg-white p-3 sm:p-5">
      {title && <h1 className="mb-3 text-xl font-bold">{title}</h1>}
      {children}
    </div>
  );
}

export function AnalyticsCard({
  title,
  className = "",
  children,
}: Readonly<{ title?: string; className?: string; children: ReactNode }>) {
  return (
    <section className={`rounded-xl border border-[#9ca3af] bg-white/95 p-3 shadow-sm ${className}`}>
      {title && <h2 className="mb-2 text-sm font-bold text-[#202020]">{title}</h2>}
      {children}
    </section>
  );
}

export function SelectFilter({
  name,
  label,
  value,
  options,
}: Readonly<{ name: string; label: string; value: string; options: { value: string; label: string }[] }>) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-white px-3 text-sm">
      <span>{label}</span>
      <select name={name} defaultValue={value} className="border-0 bg-transparent pr-1 outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({
  action,
  exportHref,
  children,
}: Readonly<{ action: string; exportHref?: string; children: ReactNode }>) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {children}
      <button type="submit" className="h-9 rounded-md border border-neutral-700 bg-[#eef0fa] px-3 text-sm font-semibold">
        Apply
      </button>
      {exportHref ? (
        <div className="ml-auto">
          <ExportMenu href={exportHref} primary />
        </div>
      ) : null}
    </form>
  );
}

export function DonutChart({
  passed,
  failed,
  title,
  size = 180,
}: Readonly<{ passed: number; failed: number; title: string; size?: number }>) {
  const total = passed + failed;
  const passedPct = total ? (passed / total) * 100 : 0;
  const failedPct = total ? (failed / total) * 100 : 0;
  const hole = Math.round(size * 0.19);
  return (
    <div>
      {title && <p className="mb-2 text-center text-xs font-semibold">{title}</p>}
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div
          className="relative rounded-full"
          style={{ width: size, height: size, background: `conic-gradient(#1f4a9f 0 ${passedPct}%, #93baf4 ${passedPct}% 100%)` }}
        >
          <div
            className="absolute flex flex-col items-center justify-center rounded-full bg-white text-center"
            style={{ inset: hole }}
          >
            <strong className="text-lg">{total.toLocaleString()}</strong>
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
  fill = false,
}: Readonly<{ items: { label: string; value: number }[]; title: string; max?: number; fill?: boolean }>) {
  return (
    <div className={fill ? "flex h-full flex-col" : ""}>
      {title && <p className="mb-3 text-center text-xs font-semibold">{title}</p>}
      <div className={fill ? "flex flex-1 flex-col justify-around gap-3 py-1" : "space-y-3"}>
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[120px_1fr_42px] items-center gap-2 text-xs">
            <span className="truncate text-right">{item.label}</span>
            <div className={`${fill ? "h-6" : "h-5"} bg-neutral-100`}><div className="h-full bg-[#1f4a9f]" style={{ width: `${Math.max(0, Math.min(100, (item.value / max) * 100))}%` }} /></div>
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

const INSIGHT_TONES = {
  neutral: { wrap: "border-[#c7cbe8] bg-[#eef0fa] text-[#2c317a]", Icon: Lightbulb },
  positive: { wrap: "border-green-200 bg-green-50 text-green-800", Icon: TrendingUp },
  warning: { wrap: "border-amber-200 bg-amber-50 text-amber-800", Icon: TriangleAlert },
} as const;

/**
 * Small callout that explains what a chart or metric is telling the reader.
 * Keep the text to a sentence or two — it sits under a card or beside an element.
 */
export function Insight({
  children,
  tone = "neutral",
  label = "Insight",
}: Readonly<{ children: ReactNode; tone?: keyof typeof INSIGHT_TONES; label?: string }>) {
  const { wrap, Icon } = INSIGHT_TONES[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${wrap}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-semibold">{label}:</span> {children}
      </p>
    </div>
  );
}

/**
 * Part-to-whole pie with a legend that carries each slice's value and share.
 * Slice colors are passed in (the caller owns a CVD-safe categorical order);
 * the legend's direct values cover the slices whose fill is low-contrast.
 */
export function PieChart({
  items,
  title,
  unit = "",
  empty = "No data available.",
}: Readonly<{ items: { label: string; value: number; color: string }[]; title: string; unit?: string; empty?: string }>) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const cx = 100;
  const cy = 100;
  const radius = 92;
  const point = (deg: number) => [cx + radius * Math.cos((deg * Math.PI) / 180), cy + radius * Math.sin((deg * Math.PI) / 180)];
  const positive = items.filter((item) => item.value > 0);
  const slices = positive
    .map((item, index) => {
      const prior = positive.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0);
      const sweep = (item.value / total) * 360;
      const start = -90 + (prior / total) * 360;
      const end = start + sweep;
      const [x1, y1] = point(start);
      const [x2, y2] = point(end);
      const large = sweep > 180 ? 1 : 0;
      const pct = (item.value / total) * 100;
      const full = sweep >= 359.999;
      const path = full
        ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
      const [lx, ly] = point(start + sweep / 2).map((value, index) => cx + (value - (index ? cy : cx)) * 0.62);
      return { ...item, path, pct, lx, ly, showLabel: pct >= 8 };
    });

  return (
    <div>
      {title && <p className="mb-3 text-center text-xs font-semibold">{title}</p>}
      {total > 0 ? (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center">
          <svg viewBox="0 0 200 200" className="h-[200px] w-[200px] shrink-0" role="img" aria-label={title}>
            {slices.map((slice) => (
              <path key={slice.label} d={slice.path} fill={slice.color} stroke="#ffffff" strokeWidth="2">
                <title>{`${slice.label}: ${slice.value.toLocaleString("en-US")}${unit ? ` ${unit}` : ""} (${slice.pct.toFixed(1)}%)`}</title>
              </path>
            ))}
            {slices.filter((slice) => slice.showLabel).map((slice) => (
              <text key={`${slice.label}-label`} x={slice.lx} y={slice.ly} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="600" fill="#ffffff">
                {Math.round(slice.pct)}%
              </text>
            ))}
          </svg>
          <ul className="w-full max-w-[16rem] space-y-1.5 text-xs">
            {slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-neutral-800">{slice.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{slice.value.toLocaleString("en-US")}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-neutral-500">{slice.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-neutral-500">{empty}</p>
      )}
    </div>
  );
}
