/**
 * Single-series horizontal bar list. One hue (identity comes from the row
 * label, not color), thin bars with a 4px rounded data end, values in ink.
 * Each row has a hover title, and the same numbers appear in the page's tables.
 */
export function BarList({
  rows,
  emptyText = "No data yet.",
  ariaLabel,
}: Readonly<{
  rows: { label: string; value: number; note?: string }[];
  emptyText?: string;
  ariaLabel: string;
}>) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (rows.length === 0 || total === 0) {
    return <p className="py-6 text-center text-sm text-neutral-600">{emptyText}</p>;
  }

  return (
    <ul aria-label={ariaLabel} className="space-y-2.5">
      {rows.map((row) => {
        const width = max === 0 ? 0 : (row.value / max) * 100;
        const share = total === 0 ? 0 : Math.round((row.value / total) * 100);

        return (
          <li
            key={row.label}
            title={`${row.label}: ${row.value} (${share}%)`}
            className="grid grid-cols-[minmax(7rem,11rem)_1fr_3.5rem] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-[#e3e4f8]/60"
          >
            <span className="truncate text-sm text-neutral-800">{row.label}</span>
            <span className="h-3 rounded-r-[4px] bg-neutral-100">
              <span
                className="block h-full rounded-r-[4px] bg-[#4a52c4]"
                style={{ width: `${width}%`, minWidth: row.value > 0 ? "2px" : 0 }}
              />
            </span>
            <span className="text-right text-sm font-medium text-neutral-900 tabular-nums">
              {row.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
