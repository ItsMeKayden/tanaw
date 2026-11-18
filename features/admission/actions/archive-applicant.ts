"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type ArchiveResult = { success: true } | { error: string };

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Archiving hides the applicant from every admission, map, recommendation and
// report view, so refresh all of them.
function revalidateApplicantViews() {
  revalidatePath("/", "layout");
}

/** Moves an applicant (and its applications) to Archive History. */
export async function archiveApplicant(applicantIdInput: unknown): Promise<ArchiveResult> {
  const user = await requirePermission("admission", "write");

  const applicantId = parseId(applicantIdInput);
  if (!applicantId) return { error: "Invalid applicant ID." };

  try {
    const { count } = await prisma.tbl_applicant.updateMany({
      where: { applicant_id: applicantId, archived_at: null },
      data: { archived_at: new Date(), archived_by: getAccountId(user) },
    });
    if (count === 0) return { error: "Applicant not found or already archived." };

    revalidateApplicantViews();
    return { success: true };
  } catch (error) {
    console.error("Archive applicant error:", error);
    return { error: "Something went wrong while archiving the applicant." };
  }
}

/** Restores an archived applicant with all of its records. */
export async function recoverApplicant(applicantIdInput: unknown): Promise<ArchiveResult> {
  await requirePermission("admission", "write");

  const applicantId = parseId(applicantIdInput);
  if (!applicantId) return { error: "Invalid applicant ID." };

  try {
    const { count } = await prisma.tbl_applicant.updateMany({
      where: { applicant_id: applicantId, archived_at: { not: null } },
      data: { archived_at: null, archived_by: null },
    });
    if (count === 0) return { error: "This record is no longer in the archive." };

    revalidateApplicantViews();
    return { success: true };
  } catch (error) {
    console.error("Recover applicant error:", error);
    return { error: "Something went wrong while recovering the applicant." };
  }
}
