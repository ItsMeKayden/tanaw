// Server-side quota slot counts (imports Prisma).
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { createSlotTracker, type QuotaSlot } from "@/features/admission/slot-math";
import { SLOT_HOLDING_STAGES } from "@/features/admission/stages";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** The cycle's quotas with their free slots (slots minus Passed and Enrolled applicants they cover). */
export async function getQuotaSlots(db: Db, cycleId: number): Promise<QuotaSlot[]> {
  const [quotas, holders] = await Promise.all([
    db.tbl_quota.findMany({
      where: { cycle_id: cycleId },
      select: { branch_id: true, program_id: true, quota_slots: true },
    }),
    db.tbl_application.groupBy({
      by: ["branch_id", "program_id"],
      where: {
        ...ACTIVE_APPLICATION,
        cycle_id: cycleId,
        tbl_admission_stage: { stage_name: { in: [...SLOT_HOLDING_STAGES] } },
      },
      _count: { _all: true },
    }),
  ]);

  return quotas.map((quota) => {
    const used = holders
      .filter(
        (h) =>
          (quota.branch_id === null || h.branch_id === quota.branch_id) &&
          (quota.program_id === null || h.program_id === quota.program_id),
      )
      .reduce((sum, h) => sum + h._count._all, 0);
    return {
      branch_id: quota.branch_id,
      program_id: quota.program_id,
      slots: quota.quota_slots,
      remaining: quota.quota_slots - used,
    };
  });
}

/** A slot tracker loaded with the cycle's current free slots. */
export async function loadSlotTracker(db: Db, cycleId: number) {
  return createSlotTracker(await getQuotaSlots(db, cycleId));
}
