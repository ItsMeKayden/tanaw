"use server";

import { getApplicantEditData, type ApplicantEditData } from "@/features/admission/applicant-edit-data";
import { getApplicantFormReferenceData } from "@/features/admission/applicant-form-data";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export type ApplicantFormReference = {
  referenceData: Awaited<ReturnType<typeof getApplicantFormReferenceData>>;
  activeCycle: string | null;
};

/**
 * Data for the add/edit applicant modal. Pass an applicant id to edit;
 * set withReference when the page did not already load the dropdown data.
 */
export async function loadApplicantForm(input: {
  applicantId?: number;
  withReference: boolean;
}): Promise<{ edit: ApplicantEditData | null; reference: ApplicantFormReference | null } | { error: string }> {
  await requirePermission("admission", "write");

  const applicantId = input?.applicantId === undefined ? null : Number(input.applicantId);
  if (applicantId !== null && (!Number.isSafeInteger(applicantId) || applicantId <= 0)) {
    return { error: "Invalid applicant." };
  }

  try {
    const [edit, reference] = await Promise.all([
      applicantId === null ? Promise.resolve(null) : getApplicantEditData(applicantId),
      input?.withReference
        ? Promise.all([
            getApplicantFormReferenceData(),
            prisma.tbl_admission_cycle.findFirst({
              where: { is_active: true },
              orderBy: { start_date: "desc" },
              select: { school_year: true },
            }),
          ]).then(([referenceData, cycle]) => ({ referenceData, activeCycle: cycle?.school_year ?? null }))
        : Promise.resolve(null),
    ]);

    if (applicantId !== null && !edit) return { error: "This applicant has no application to edit." };
    return { edit, reference };
  } catch (error) {
    console.error("Load applicant form error:", error);
    return { error: "Something went wrong while loading the form." };
  }
}
