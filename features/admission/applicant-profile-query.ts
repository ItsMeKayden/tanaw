// Server-side query for the applicant profile page (imports Prisma).
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICANT } from "@/features/admission/archive-core";

export function getApplicantProfile(applicantId: number) {
  return prisma.tbl_applicant.findUnique({
    where: { applicant_id: applicantId, ...ACTIVE_APPLICANT },
    select: {
      applicant_id: true,
      last_name: true,
      first_name: true,
      middle_name: true,
      suffix: true,
      sex: true,
      birth_date: true,
      email: true,
      mobile_no: true,
      // The profile focuses on the most recent application.
      tbl_application: {
        orderBy: { application_date: "desc" },
        take: 1,
        select: {
          application_id: true,
          application_no: true,
          application_date: true,
          tbl_school: {
            select: { school_name: true, school_type: true, city_municipality: true },
          },
          tbl_barangay: {
            select: {
              barangay_name: true,
              tbl_district: { select: { district_name: true } },
            },
          },
          tbl_branch: { select: { branch_name: true } },
          tbl_program: { select: { program_code: true, program_name: true } },
          program_choice_2: { select: { program_code: true, program_name: true } },
          program_choice_3: { select: { program_code: true, program_name: true } },
          tbl_admission_cycle: {
            select: {
              school_year: true,
              tbl_passing_score_setting: {
                orderBy: { effective_date: "desc" },
                take: 1,
                select: { passing_value: true, criteria_type: true },
              },
            },
          },
          tbl_admission_stage: { select: { stage_id: true, stage_name: true } },
          tbl_exam_result: {
            orderBy: { result_id: "desc" },
            select: {
              result_id: true,
              raw_score: true,
              percentage: true,
              result_status: true,
              tbl_exam: {
                select: { exam_name: true, exam_date: true, max_score: true },
              },
            },
          },
          // Metadata only — never load file_data here.
          tbl_application_document: {
            select: {
              document_id: true,
              document_type: true,
              file_name: true,
              file_size: true,
              uploaded_at: true,
              tbl_user_account: { select: { full_name: true } },
            },
          },
          tbl_application_stage_log: {
            orderBy: { changed_at: "desc" },
            select: {
              log_id: true,
              changed_at: true,
              remarks: true,
              tbl_admission_stage: { select: { stage_name: true } },
              tbl_user_account: { select: { full_name: true, email: true } },
            },
          },
        },
      },
    },
  });
}

export type ApplicantProfileData = NonNullable<
  Awaited<ReturnType<typeof getApplicantProfile>>
>;
