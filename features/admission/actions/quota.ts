"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { quotaScopeFor } from "@/features/admission/admission-stats";
import { quotaFormSchema } from "@/features/admission/schemas";

type ActionResult = { success: true; message: string } | { error: string };

function parseOptionalId(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : "invalid";
}

/**
 * Creates or updates the quota for a cycle + campus + program combination
 * (campus/program null = applies to all). One quota per combination.
 */
export async function saveQuota(input: {
  cycle_id: number;
  branch_id: string;
  program_id: string;
  quota_slots: string;
}): Promise<ActionResult> {
  const user = await requirePermission("admission", "write");

  const cycleId = parseOptionalId(input.cycle_id);
  if (!cycleId || cycleId === "invalid") return { error: "Invalid admission cycle." };

  const parsed = quotaFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const branchId = parsed.data.branch_id ? Number(parsed.data.branch_id) : null;
  const programId = parsed.data.program_id ? Number(parsed.data.program_id) : null;
  const slots = Number(parsed.data.quota_slots);

  try {
    const accountId = getAccountId(user);

    const result = await prisma.$transaction(async (tx) => {
      const [cycle, branch, program] = await Promise.all([
        tx.tbl_admission_cycle.findUnique({ where: { cycle_id: cycleId }, select: { cycle_id: true } }),
        branchId
          ? tx.tbl_branch.findUnique({ where: { branch_id: branchId }, select: { branch_id: true } })
          : Promise.resolve(true),
        programId
          ? tx.tbl_program.findUnique({ where: { program_id: programId }, select: { program_id: true } })
          : Promise.resolve(true),
      ]);

      if (!cycle) throw new Error("Admission cycle not found.");
      if (!branch) throw new Error("Campus not found.");
      if (!program) throw new Error("Program not found.");

      const data = {
        quota_slots: slots,
        quota_scope: quotaScopeFor(branchId, programId),
        updated_by: accountId,
      };

      const existing = await tx.tbl_quota.findFirst({
        where: { cycle_id: cycleId, branch_id: branchId, program_id: programId },
        select: { quota_id: true },
      });

      if (existing) {
        await tx.tbl_quota.update({ where: { quota_id: existing.quota_id }, data });
        return "updated";
      }

      await tx.tbl_quota.create({
        data: { ...data, cycle_id: cycleId, branch_id: branchId, program_id: programId },
      });
      return "created";
    });

    revalidatePath("/admission/quota");
    revalidatePath("/admission/summary");

    return { success: true, message: result === "created" ? "Quota added." : "Quota updated." };
  } catch (error) {
    console.error("Save quota error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function deleteQuota(quotaId: number): Promise<ActionResult> {
  await requirePermission("admission", "write");

  const id = parseOptionalId(quotaId);
  if (!id || id === "invalid") return { error: "Invalid quota." };

  try {
    const deleted = await prisma.tbl_quota.deleteMany({ where: { quota_id: id } });
    if (deleted.count === 0) return { error: "Quota not found." };

    revalidatePath("/admission/quota");
    revalidatePath("/admission/summary");

    return { success: true, message: "Quota deleted." };
  } catch (error) {
    console.error("Delete quota error:", error);
    return { error: "Something went wrong while deleting the quota." };
  }
}
