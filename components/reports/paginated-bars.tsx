"use client";

import { useState } from "react";

/**
 * Single-series vertical bars that page through a long list of items on the
 * client — moving between pages re-renders only this component, not the route.
 * Bar heights use the global maximum so pages stay visually comparable.
 */
export function PaginatedBars({
  items,
  title,
  pageSize = 12,
}: Readonly<{ items: { label: string; value: number }[]; title: string; pageSize?: number }>) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const slice = items.slice(start, start + pageSize);
  const max = Math.max(1, ...items.map((item) => item.value)) * 1.15;

  const width = 430;
  const height = 210;
  const base = 170;
  const left = 40;
  const slot = (width - left - 20) / Math.max(slice.length, 1);
  const btn = "rounded-md border border-neutral-500 px-2.5 py-1 font-medium enabled:hover:bg-neutral-100 disabled:border-neutral-200 disabled:text-neutral-300 disabled:hover:bg-transparent";

  return (
    <div>
      <div className="rounded-xl border border-neutral-500 p-3">
        <p className="mb-2 text-center text-xs font-semibold">{title}</p>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label={title}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = base - tick * (base - 20);
            return <g key={tick}><line x1={left} x2={width - 10} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 4" /><text x={left - 8} y={y + 3} textAnchor="end" fontSize="8">{Math.round(max * tick)}</text></g>;
          })}
          {slice.map((item, index) => {
            const x = left + index * slot + slot * 0.2;
            const barWidth = slot * 0.6;
            const barHeight = (item.value / max) * (base - 20);
            return <g key={`${item.label}-${index}`}>
              <rect x={x} y={base - barHeight} width={barWidth} height={barHeight} fill="#1f4a9f" />
              <text x={x + barWidth / 2} y={base + 14} textAnchor="middle" fontSize="8">{item.label}</text>
              <text x={x + barWidth / 2} y={base - barHeight - 4} textAnchor="middle" fontSize="7">{item.value}</text>
            </g>;
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-neutral-500">Showing {items.length ? `${start + 1}–${start + slice.length}` : 0} of {items.length}</span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className={btn}>Prev</button>
            <span className="px-1.5 text-neutral-600">Page {current + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage(current + 1)} disabled={current === pageCount - 1} className={btn}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
