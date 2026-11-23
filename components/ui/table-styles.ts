/**
 * Shared look for the module list tables (applicants, archive, enrollment
 * verification, recommendations, user accounts): a rounded card, a tinted
 * header with small uppercase labels, row dividers instead of a full grid,
 * and a soft hover.
 */
export const tableStyles = {
  wrap: "overflow-x-auto rounded-xl border border-neutral-300 bg-white/95 shadow-sm",
  headRow: "border-b border-neutral-300 bg-[#f4f5fd]",
  th: "px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-[#191e73] uppercase",
  body: "divide-y divide-neutral-200",
  row: "transition-colors hover:bg-[#f4f5fd]",
  td: "px-4 py-3 align-middle",
  empty: "px-4 py-12 text-center text-sm text-neutral-600",
  /**
   * Editable grids (scores, quotas, weights, role access) keep light cell
   * borders for data entry; the outer edge comes from `wrap`, so the cells'
   * outer borders are dropped.
   */
  grid: "w-full border-collapse text-sm [&_tbody_tr:last-child>*]:border-b-0 [&_thead_tr:first-child>*]:border-t-0 [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0",
  gridHeadRow: "bg-[#f4f5fd] text-xs font-semibold tracking-wide text-[#191e73] uppercase",
  /** Small outlined button used for row actions (View, Edit…). */
  action:
    "inline-flex h-7 items-center rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50",
};
