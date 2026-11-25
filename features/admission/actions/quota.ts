"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { QUOTA_SCOPES } from "@/features/admission/admission-stats";
import { quotaPlanSchema, type QuotaPlanValues } from "@/features/admission/schemas";

type ActionResult = { success: true; message: string } | { error: string };

/**
 * Saves a cycle's overall target and per-course quotas (campus = all).
 * A blank value removes that quota. Campus and campus + course quotas are
 * left untouched.
 */
export async function saveQuotaPlan(cycleIdInput: number, input: QuotaPlanValues): Promise<ActionResult> {
  const user = await requirePermission("admission", "write");

  const cycleId = Number(cycleIdInput);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return { error: "Invalid admission cycle." };

  const parsed = quotaPlanSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { overall, courses } = parsed.data;
  const programIds = courses.map((c) => c.program_id);
  if (new Set(programIds).size !== programIds.length) return { error: "A course is listed twice." };
  // Course quotas share the overall target, so together they can't exceed it.
  if (overall !== "") {
    const allocated = courses.reduce((sum, c) => sum + (c.slots === "" ? 0 : Number(c.slots)), 0);
    if (allocated > Number(overall)) {
      return {
        error: `Course quotas add up to ${allocated.toLocaleString("en-US")}, more than the overall target of ${Number(overall).toLocaleString("en-US")}.`,
      };
    }
  }

  try {
    const accountId = getAccountId(user);

    await prisma.$transaction(async (tx) => {
      const [cycle, programCount] = await Promise.all([
        tx.tbl_admission_cycle.findUnique({ where: { cycle_id: cycleId }, select: { cycle_id: true } }),
        tx.tbl_program.count({ where: { program_id: { in: programIds } } }),
      ]);
      if (!cycle) throw new Error("Admission cycle not found.");
      if (programCount !== programIds.length) throw new Error("A course no longer exists. Reload the page.");

      const upsert = async (programId: number | null, slots: string) => {
        const where = { cycle_id: cycleId, branch_id: null, program_id: programId };
        if (slots === "") {
          await tx.tbl_quota.deleteMany({ where });
          return;
        }
        const data = {
          quota_slots: Number(slots),
          quota_scope: programId ? QUOTA_SCOPES.PROGRAM : QUOTA_SCOPES.OVERALL,
          updated_by: accountId,
        };
        const existing = await tx.tbl_quota.findFirst({ where, select: { quota_id: true } });
        if (existing) await tx.tbl_quota.update({ where: { quota_id: existing.quota_id }, data });
        else await tx.tbl_quota.create({ data: { ...data, ...where } });
      };

      await upsert(null, overall);
      for (const course of courses) await upsert(course.program_id, course.slots);
    });

    revalidatePath("/admission/quota");
    return { success: true, message: "Quota saved." };
  } catch (error) {
    console.error("Save quota error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
