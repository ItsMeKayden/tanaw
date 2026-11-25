// Data for the Additional Applicants page (imports Prisma).
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { formatFullName } from "@/features/admission/enrollment-queries";
import { getQuotaSlots } from "@/features/admission/slots";
import { ADMISSION_STAGES } from "@/features/admission/stages";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type WaitlistedApplicant = {
  application_id: number;
  application_no: string;
  name: string;
  branch_id: number | null;
  program_id: number | null;
  course_code: string | null;
  course_name: string | null;
  campus: string | null;
  percentage: number | null;
  raw_score: number | null;
  waitlisted_at: string | null;
};

/**
 * Waitlisted applications of a cycle, best first: highest exam
 * percentage, then raw score, then whoever applied earlier.
 */
export async function getWaitlistedApplicants(db: Db, cycleId: number, ids?: number[]): Promise<WaitlistedApplicant[]> {
  const applications = await db.tbl_application.findMany({
    where: {
      ...ACTIVE_APPLICATION,
      cycle_id: cycleId,
      tbl_admission_stage: { stage_name: ADMISSION_STAGES.WAITLISTED },
      ...(ids ? { application_id: { in: ids } } : {}),
    },
    select: {
      application_id: true,
      application_no: true,
      application_date: true,
      branch_id: true,
      program_id: true,
      tbl_applicant: { select: { first_name: true, middle_name: true, last_name: true, suffix: true } },
      tbl_program: { select: { program_code: true, program_name: true } },
      tbl_branch: { select: { branch_name: true } },
      tbl_exam_result: {
        select: { percentage: true, raw_score: true },
        orderBy: { result_id: "desc" },
        take: 1,
      },
      tbl_application_stage_log: {
        where: { tbl_admission_stage: { stage_name: ADMISSION_STAGES.WAITLISTED } },
        select: { changed_at: true },
        orderBy: { changed_at: "desc" },
        take: 1,
      },
    },
  });

  return applications
    .map((application) => {
      const result = application.tbl_exam_result[0];
      return {
        sortDate: application.application_date.getTime(),
        row: {
          application_id: application.application_id,
          application_no: application.application_no,
          name: formatFullName(application.tbl_applicant),
          branch_id: application.branch_id,
          program_id: application.program_id,
          course_code: application.tbl_program?.program_code ?? null,
          course_name: application.tbl_program?.program_name ?? null,
          campus: application.tbl_branch?.branch_name ?? null,
          percentage: result?.percentage === null || result?.percentage === undefined ? null : Number(result.percentage),
          raw_score: result?.raw_score ?? null,
          waitlisted_at: application.tbl_application_stage_log[0]?.changed_at?.toISOString() ?? null,
        },
      };
    })
    .sort(
      (a, b) =>
        (b.row.percentage ?? -1) - (a.row.percentage ?? -1) ||
        (b.row.raw_score ?? -1) - (a.row.raw_score ?? -1) ||
        a.sortDate - b.sortDate,
    )
    .map((entry) => entry.row);
}

/** Everything the page needs for one cycle. */
export async function getAdditionalApplicantsData(cycleId: number) {
  const [applicants, quotas, programs] = await Promise.all([
    getWaitlistedApplicants(prisma, cycleId),
    getQuotaSlots(prisma, cycleId),
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true } }),
  ]);
  const courseCodes = Object.fromEntries(programs.map((p) => [p.program_id, p.program_code]));
  return { applicants, quotas, courseCodes };
}
