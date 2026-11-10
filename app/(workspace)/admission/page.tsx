import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import ApplicantTable from "@/components/admission/applicant-table";
import { connection } from "next/server";

async function AdmissionContent() {
  await connection();
  const user = await requirePermission("admission", "read");

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
        select: {
          tbl_admission_stage: {
            select: {
              stage_name: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applicants</h1>
        <p className="text-sm text-muted-foreground">
          Manage and view applicant information.
        </p>
      </div>

      <div className="text-sm text-muted-foreground">
        Welcome, {user.name ?? user.email} · {user.role}
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Total Applicants</p>
        <p className="text-2xl font-bold">{applicants.length}</p>
      </div>

      <ApplicantTable applicants={applicants} />
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
