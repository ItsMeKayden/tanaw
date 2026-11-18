// Server-side queries for enrollment verification (imports Prisma; do not
// import from client components).
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import {
  ADMISSION_STAGES,
  ADMITTED_STAGES,
  ENROLLMENT_DECISION_STAGES,
  EXAM_RESULT_PASSED,
} from "@/features/admission/stages";

export type EnrollmentStatus = "ENROLLED" | "NOT_ENROLLED" | "PENDING";

export function formatFullName(
  applicant: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  } | null,
) {
  if (!applicant) return "Unknown Applicant";
  return [applicant.first_name, applicant.middle_name, applicant.last_name, applicant.suffix]
    .filter(Boolean)
    .join(" ");
}

/**
 * Admitted applications (stage Passed / Enrolled / Not Enrolled) with the
 * data the enrollment verification list and the registrar export need.
 */
export async function getAdmittedApplications() {
  const applications = await prisma.tbl_application.findMany({
    where: {
      ...ACTIVE_APPLICATION,
      tbl_admission_stage: { stage_name: { in: [...ADMITTED_STAGES] } },
    },
    orderBy: { application_no: "asc" },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: {
        select: {
          applicant_id: true,
          first_name: true,
          middle_name: true,
          last_name: true,
          suffix: true,
          email: true,
          mobile_no: true,
        },
      },
      tbl_program: { select: { program_code: true } },
      tbl_branch: { select: { branch_name: true } },
      tbl_admission_stage: { select: { stage_name: true } },
      tbl_exam_result: {
        where: { result_status: EXAM_RESULT_PASSED },
        orderBy: { result_id: "desc" },
        take: 1,
        select: {
          raw_score: true,
          percentage: true,
          tbl_exam: { select: { max_score: true } },
        },
      },
      // Who made the latest enrollment decision.
      tbl_application_stage_log: {
        where: {
          tbl_admission_stage: {
            stage_name: { in: [...ENROLLMENT_DECISION_STAGES] },
          },
        },
        orderBy: { changed_at: "desc" },
        take: 1,
        select: {
          changed_at: true,
          tbl_user_account: { select: { full_name: true } },
        },
      },
    },
  });

  return applications.map((application) => {
    const applicant = application.tbl_applicant;
    const examResult = application.tbl_exam_result[0];
    const stageName = application.tbl_admission_stage?.stage_name ?? null;
    const decision = application.tbl_application_stage_log[0];

    let status: EnrollmentStatus = "PENDING";
    if (stageName === ADMISSION_STAGES.ENROLLED) status = "ENROLLED";
    else if (stageName === ADMISSION_STAGES.NOT_ENROLLED) status = "NOT_ENROLLED";

    return {
      application_id: application.application_id,
      application_no: application.application_no,
      applicant_id: applicant?.applicant_id ?? null,
      full_name: formatFullName(applicant),
      email: applicant?.email ?? null,
      mobile_no: applicant?.mobile_no ?? null,
      program_code: application.tbl_program?.program_code ?? null,
      branch_name: application.tbl_branch?.branch_name ?? null,
      status,
      has_passed_exam: Boolean(examResult),
      raw_score: examResult?.raw_score ?? null,
      max_score: examResult?.tbl_exam?.max_score ?? null,
      exam_percentage:
        examResult?.percentage == null ? null : Number(examResult.percentage),
      verified_by:
        status === "PENDING" ? null : (decision?.tbl_user_account?.full_name ?? null),
      verified_at:
        status === "PENDING" ? null : (decision?.changed_at?.toISOString() ?? null),
    };
  });
}

export type AdmittedApplication = Awaited<
  ReturnType<typeof getAdmittedApplications>
>[number];
