// Applicant archive (server only — imports Prisma).
//
// "Deleting" an applicant archives it: archived_at is set and the applicant and
// all of its applications disappear from every list, count, map, export and
// recommendation (see ACTIVE_APPLICANT / ACTIVE_APPLICATION in archive-core).
// Archive History lists them for recovery. Records archived longer than
// ARCHIVE_RETENTION_DAYS are permanently deleted whenever the Applicants or
// Archive History page loads, or by `npm run archive:purge` on a schedule.
import { prisma } from "@/lib/prisma";
import type { ArchivedRow } from "@/components/admission/archive-table";
import { archiveExpiresAt, purgeExpiredArchives } from "@/features/admission/archive-core";

export * from "@/features/admission/archive-core";

/** Purges expired archives without letting a failure break the page that triggered it. */
export async function purgeExpiredArchivesSafely() {
  try {
    return await purgeExpiredArchives(prisma);
  } catch (error) {
    console.error("Archive purge failed:", error);
    return 0;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Archived applicants (newest first) with their latest application and deletion date. */
export async function getArchivedApplicants(): Promise<ArchivedRow[]> {
  const archived = await prisma.tbl_applicant.findMany({
    where: { archived_at: { not: null } },
    orderBy: { archived_at: "desc" },
    select: {
      applicant_id: true,
      first_name: true,
      middle_name: true,
      last_name: true,
      suffix: true,
      archived_at: true,
      archived_by_user: { select: { full_name: true } },
      tbl_application: {
        orderBy: { application_date: "desc" },
        take: 1,
        select: {
          application_no: true,
          tbl_program: { select: { program_code: true, program_name: true } },
          tbl_admission_stage: { select: { stage_name: true } },
        },
      },
    },
  });

  const now = Date.now();
  return archived.map((applicant) => {
    const application = applicant.tbl_application[0];
    const archivedAt = applicant.archived_at!;
    const expiresAt = archiveExpiresAt(archivedAt);
    return {
      applicant_id: applicant.applicant_id,
      application_no: application?.application_no ?? null,
      name: [applicant.first_name, applicant.middle_name, applicant.last_name, applicant.suffix]
        .filter(Boolean)
        .join(" "),
      course_code: application?.tbl_program?.program_code ?? null,
      course_name: application?.tbl_program?.program_name ?? null,
      stage: application?.tbl_admission_stage?.stage_name ?? null,
      archived_at: archivedAt.toISOString(),
      archived_by: applicant.archived_by_user?.full_name ?? null,
      expires_at: expiresAt.toISOString(),
      days_left: Math.max(0, Math.ceil((expiresAt.getTime() - now) / DAY_MS)),
    };
  });
}
