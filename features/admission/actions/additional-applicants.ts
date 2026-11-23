"use server";

import { revalidatePath } from "next/cache";

import { getQualifiedApplicants } from "@/features/admission/additional-applicants";
import { loadSlotTracker } from "@/features/admission/slots";
import { ADMISSION_STAGES } from "@/features/admission/stages";
import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type ActionResult = { success: true; message: string } | { error: string };

const MAX_BATCH = 1000;

/**
 * Admits the selected Qualified applicants (waiting list) as an additional
 * batch: each moves to Passed if their course still has a free slot. The
 * whole batch is rejected if any of them no longer fits, so nobody is
 * admitted past the quota.
 */
export async function admitAdditionalBatch(cycleIdInput: number, applicationIds: number[]): Promise<ActionResult> {
  const user = await requirePermission("admission", "write");

  const cycleId = Number(cycleIdInput);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return { error: "Invalid admission cycle." };
  if (!Array.isArray(applicationIds) || applicationIds.length === 0) return { error: "Select at least one applicant." };
  if (applicationIds.length > MAX_BATCH) return { error: `Admit at most ${MAX_BATCH} applicants at a time.` };
  const ids = applicationIds.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { error: "Invalid applicant in the selection." };
  if (new Set(ids).size !== ids.length) return { error: "An applicant is selected twice." };

  try {
    const accountId = getAccountId(user);

    const admitted = await prisma.$transaction(
      async (tx) => {
        const [applicants, tracker, passed] = await Promise.all([
          getQualifiedApplicants(tx, cycleId, ids),
          loadSlotTracker(tx, cycleId),
          tx.tbl_admission_stage.findFirst({
            where: { stage_name: ADMISSION_STAGES.PASSED },
            select: { stage_id: true },
          }),
        ]);
        if (!passed) throw new Error('The "Passed" admission stage is missing. Run the database seed.');
        if (applicants.length !== ids.length) {
          throw new Error("Some selected applicants are no longer on the waiting list. Reload the page.");
        }

        // Best-ranked first, so the slots go to them if the selection is too big.
        for (const applicant of applicants) {
          if (!tracker.take(applicant)) {
            throw new Error(
              `No free slot left for ${applicant.name} (${applicant.course_code ?? "no course"}). ` +
                "Unselect some applicants or raise the quota first.",
            );
          }
        }

        await tx.tbl_application.updateMany({
          where: { application_id: { in: ids } },
          data: { current_stage_id: passed.stage_id },
        });
        await tx.tbl_application_stage_log.createMany({
          data: ids.map((application_id) => ({
            application_id,
            stage_id: passed.stage_id,
            changed_by: accountId,
            remarks: "Admitted from the waiting list in an additional batch.",
          })),
        });
        return applicants.length;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    for (const path of [
      "/admission/additional-applicants",
      "/admission/enrollment-verification",
      "/admission/quota",
      "/admission",
      "/dashboard",
    ]) {
      revalidatePath(path);
    }
    return {
      success: true,
      message: `Admitted ${admitted} applicant${admitted === 1 ? "" : "s"} in an additional batch. They now appear in Enrollment Verification.`,
    };
  } catch (error) {
    console.error("Admit additional batch error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong while admitting the batch." };
  }
}
