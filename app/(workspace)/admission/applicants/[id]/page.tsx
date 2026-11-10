import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import ApplicantProfile from "@/components/admission/applicant-profile";
import { connection } from "next/server";
import UpdateApplicationStageForm from "@/components/admission/update-application-stage-form";
import { auth } from "@/auth";

type ApplicantPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function ApplicantProfileContent({ params }: ApplicantPageProps) {
  await connection();
  // Protect the page using the existing authorization system.
  await requirePermission("admission", "read");

  const session = await auth();
  const canUpdateStage = session?.user?.role === "ADMISSION";

  const { id } = await params;
  const applicantId = Number(id);

  // Validate the applicant ID.
  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
    notFound();
  }

  // Retrieve the applicant and all related application information.
  const applicant = await prisma.tbl_applicant.findUnique({
    where: {
      applicant_id: applicantId,
    },
    select: {
      applicant_id: true,
      last_name: true,
      first_name: true,
      middle_name: true,
      sex: true,
      birth_date: true,
      email: true,
      mobile_no: true,

      tbl_application: {
        orderBy: {
          application_date: "desc",
        },
        select: {
          application_id: true,
          application_no: true,
          application_date: true,

          tbl_school: {
            select: {
              school_name: true,
              school_type: true,
              city_municipality: true,
            },
          },

          tbl_barangay: {
            select: {
              barangay_name: true,
              tbl_district: {
                select: {
                  district_name: true,
                },
              },
            },
          },

          tbl_branch: {
            select: {
              branch_name: true,
            },
          },

          tbl_program: {
            select: {
              program_code: true,
              program_name: true,
            },
          },

          tbl_admission_cycle: {
            select: {
              school_year: true,
            },
          },

          tbl_admission_stage: {
            select: {
              stage_id: true,
              stage_name: true,
            },
          },

          tbl_application_stage_log: {
            orderBy: {
              changed_at: "desc",
            },
            select: {
              log_id: true,
              changed_at: true,
              remarks: true,
              tbl_admission_stage: {
                select: {
                  stage_name: true,
                },
              },
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const stages = await prisma.tbl_admission_stage.findMany({
    orderBy: {
      stage_order: "asc",
    },
    select: {
      stage_id: true,
      stage_name: true,
    },
  });

  // Show a 404 page if the applicant does not exist.
  if (!applicant) {
    notFound();
  }

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/admission"
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to Applicants
      </Link>

      <ApplicantProfile
        applicant={applicant}
        stages={stages}
        canUpdateStage={canUpdateStage}
      />
    </div>
  );
}

export default function ApplicantProfilePage({ params }: ApplicantPageProps) {
  return (
    <Suspense fallback={null}>
      <ApplicantProfileContent params={params} />
    </Suspense>
  );
}
