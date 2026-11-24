// Quota slot bookkeeping shared by the server (exam results, additional
// batches) and the Additional Applicants page (live preview while selecting).

/** A quota and how many of its slots are still free. Null campus/course = any. */
export type QuotaSlot = {
  branch_id: number | null;
  program_id: number | null;
  slots: number;
  remaining: number;
};

/** Where an application would take a slot (its campus and 1st-choice course). */
export type SlotTarget = { branch_id: number | null; program_id: number | null };

function covers(quota: QuotaSlot, target: SlotTarget) {
  return (
    (quota.branch_id === null || quota.branch_id === target.branch_id) &&
    (quota.program_id === null || quota.program_id === target.program_id)
  );
}

/**
 * Tracks free slots while applicants are admitted one by one. An applicant
 * needs a free slot in every quota that covers them (e.g. the whole cycle
 * and their course). With no quota covering them, there is no limit.
 */
export function createSlotTracker(quotas: readonly QuotaSlot[]) {
  const remaining = quotas.map((quota) => quota.remaining);
  const matching = (target: SlotTarget) =>
    quotas.flatMap((quota, index) => (covers(quota, target) ? [index] : []));

  return {
    /** Free slots for this target: the smallest remaining among its quotas (Infinity = no quota). */
    available(target: SlotTarget) {
      const indexes = matching(target);
      return indexes.length === 0 ? Infinity : Math.max(0, Math.min(...indexes.map((i) => remaining[i])));
    },
    /** Takes a slot if one is free in every covering quota. */
    take(target: SlotTarget) {
      const indexes = matching(target);
      if (indexes.some((i) => remaining[i] <= 0)) return false;
      for (const i of indexes) remaining[i]--;
      return true;
    },
    /** Gives a slot back (the applicant no longer holds one). */
    release(target: SlotTarget) {
      for (const i of matching(target)) remaining[i]++;
    },
  };
}

/** Free slots in total: the cycle-wide quota if set, else the sum of course quotas (Infinity = no limit). */
export function totalOpenSlots(quotas: readonly QuotaSlot[]) {
  const overall = quotas.find((q) => q.branch_id === null && q.program_id === null);
  const courses = quotas.filter((q) => q.program_id !== null);
  const courseTotal = courses.reduce((sum, q) => sum + Math.max(0, q.remaining), 0);
  if (overall) return courses.length ? Math.min(Math.max(0, overall.remaining), courseTotal) : Math.max(0, overall.remaining);
  return courses.length ? courseTotal : Infinity;
}
