import type { ReactNode } from "react";

import { ExportMenu } from "@/components/reports/export-menu";

export function AnalyticsPage({
  title,
  exportHref,
  children,
}: Readonly<{ title?: string; exportHref?: string; children: ReactNode }>) {
  return (
    <div className="min-h-full bg-white p-3 sm:p-5">
      {title && <h1 className="mb-3 text-xl font-bold">{title}</h1>}
      {exportHref && (
        <div className="mb-3 flex justify-end">
          <ExportMenu href={exportHref} primary />
        </div>
      )}
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
  children,
}: Readonly<{ action: string; children: ReactNode }>) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {children}
      <button type="submit" className="h-9 rounded-md border border-neutral-700 bg-[#eef0fa] px-3 text-sm font-semibold">
        Apply
      </button>
    </form>
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
      <p className="sr-only">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label={title}>
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
}: Readonly<{ items: { label: string; publicValue: number; privateValue: number }[]; title: string }>) {
  const max = Math.max(1, ...items.map((item) => item.publicValue + item.privateValue));
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
          const belowHeight = (item.publicValue / ceiling) * (base - 20);
          const passedHeight = (item.privateValue / ceiling) * (base - 20);
          const barWidth = Math.max(20, slot - 5);
          return <g key={item.label}>
            <rect x={x} y={base - belowHeight} width={barWidth} height={belowHeight} fill="#93baf4" />
            <rect x={x} y={base - belowHeight - passedHeight} width={barWidth} height={passedHeight} fill="#1f4a9f" />
            <text x={x + barWidth / 2} y={base + 14} textAnchor="middle" fontSize="8">{item.label}</text>
            {(item.publicValue + item.privateValue) > 0 && <text x={x + barWidth / 2} y={base - belowHeight - passedHeight - 4} textAnchor="middle" fontSize="7">{item.publicValue + item.privateValue}</text>}
          </g>;
        })}
        <text x={left + (width - left) / 2} y={height - 1} textAnchor="middle" fontSize="8">Exam score</text>
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-xs"><span><i className="mr-1 inline-block size-3 bg-[#93baf4]" />Below passing score</span><span><i className="mr-1 inline-block size-3 bg-[#1f4a9f]" />Passed</span></div>
    </div>
  );
}
