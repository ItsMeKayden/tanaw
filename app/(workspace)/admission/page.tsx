import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import ApplicantTable from "@/components/admission/applicant-table";
import { connection } from "next/server";
import { hasPermission } from "@/lib/permissions";

async function AdmissionContent() {
  await connection();
  const user = await requirePermission("admission", "read");

  const canWriteAdmission = await hasPermission(
    user.role,
    "admission",
    "write",
  );
  const applicants = await prisma.tbl_applicant.findMany({
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    select: {
      applicant_id: true,
      first_name: true,
      middle_name: true,
      last_name: true,
      sex: true,
      birth_date: true,
      email: true,
      mobile_no: true,
      tbl_application: {
        orderBy: {
          application_date: "desc",
        },
        take: 1,
        select: {
          application_no: true,
          application_date: true,
          tbl_admission_stage: {
            select: {
              stage_name: true,
            },
          },
          tbl_exam_result: {
            select: {
              result_status: true,
              percentage: true,
            },
          },
        },
      },
    },
  });

  // Convert Prisma Decimal percentages into JavaScript numbers.
  const applicantsForTable = applicants.map((applicant) => ({
    ...applicant,
    tbl_application: applicant.tbl_application.map((application) => ({
      ...application,
      tbl_exam_result: application.tbl_exam_result.map((result) => ({
        ...result,
        percentage:
          result.percentage === null ? null : Number(result.percentage),
      })),
    })),
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applicants</h1>
        <p className="text-sm text-muted-foreground">
          Manage and view applicant information.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Total Applicants</p>
        <p className="text-2xl font-bold">{applicants.length}</p>
      </div>

      <ApplicantTable
        applicants={applicantsForTable}
        canWrite={canWriteAdmission}
      />
    </div>
  );
}

export default function AdmissionPage() {
  return (
    <Suspense fallback={null}>
      <AdmissionContent />
    </Suspense>
  );
}
