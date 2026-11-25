// Small number helpers shared by the analytics pages and their exports.

export const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** part / whole as a percentage (0–100); 0 when there is no whole. */
export const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

export const mean = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

/** The middle value (average of the two middle values for an even count); 0 when empty. */
export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One exam result per applicant: their latest (highest result_id). */
export function latestPerApplication<T extends { result_id: number; application_id: number | null }>(rows: T[]) {
  const latest = new Map<number, T>();
  for (const row of rows) {
    if (row.application_id === null) continue;
    const seen = latest.get(row.application_id);
    if (!seen || row.result_id > seen.result_id) latest.set(row.application_id, row);
  }
  return [...latest.values()];
}
