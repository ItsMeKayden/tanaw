// Archive rules shared by the app, the seeder, the recommendation engine and
// scripts/purge-archive.ts. Type-only imports, so it is safe anywhere.
import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export const ARCHIVE_RETENTION_DAYS = 365;

/** Filter for tbl_applicant queries: only applicants that are not archived. */
export const ACTIVE_APPLICANT = { archived_at: null } satisfies Prisma.tbl_applicantWhereInput;

/** Filter for tbl_application queries: only applications of non-archived applicants. */
export const ACTIVE_APPLICATION = {
  tbl_applicant: { is: ACTIVE_APPLICANT },
} satisfies Prisma.tbl_applicationWhereInput;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date on which an applicant archived at `archivedAt` is permanently deleted. */
export function archiveExpiresAt(archivedAt: Date) {
  return new Date(archivedAt.getTime() + ARCHIVE_RETENTION_DAYS * DAY_MS);
}

/** Applicants archived before this date are past retention. */
export function archiveRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - ARCHIVE_RETENTION_DAYS * DAY_MS);
}

/**
 * Permanently deletes applicants archived more than a year ago, with their
 * applications. Stage logs, documents, exam results, seats and course
 * recommendations go with the applications through database cascades.
 * Returns how many applicants were deleted.
 */
export async function purgeExpiredArchives(db: PrismaClient, now = new Date()): Promise<number> {
  const expired = { archived_at: { lt: archiveRetentionCutoff(now) } };
  const [, deleted] = await db.$transaction([
    db.tbl_application.deleteMany({ where: { tbl_applicant: { is: expired } } }),
    db.tbl_applicant.deleteMany({ where: expired }),
  ]);
  return deleted.count;
}
