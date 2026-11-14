import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import EditApplicantForm from "@/components/admission/edit-applicant-form";
import { connection } from "next/server";

type EditApplicantPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function EditApplicantContent({ params }: EditApplicantPageProps) {
  await connection();
  await requirePermission("admission", "write");

  const { id } = await params;
  const applicantId = Number(id);

  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
    notFound();
  }

  const applicant = await prisma.tbl_applicant.findUnique({
    where: {
      applicant_id: applicantId,
    },
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

      tbl_application: {
        orderBy: {
          application_date: "desc",
        },
        take: 1,
        select: {
          application_id: true,
          application_no: true,
          school_id: true,
          barangay_id: true,
          branch_id: true,
          program_id: true,

          tbl_barangay: {
            select: {
              district_id: true,
            },
          },
        },
      },
    },
  });

  if (!applicant || applicant.tbl_application.length === 0) {
    notFound();
  }

  const application = applicant.tbl_application[0];

  const [districts, barangays, branches, programs, schools] = await Promise.all(
    [
      prisma.tbl_district.findMany({
        orderBy: { district_name: "asc" },
        select: {
          district_id: true,
          district_name: true,
        },
      }),

      prisma.tbl_barangay.findMany({
        orderBy: { barangay_name: "asc" },
        select: {
          barangay_id: true,
          barangay_name: true,
          district_id: true,
        },
      }),

      prisma.tbl_branch.findMany({
        where: { is_active: true },
        orderBy: { branch_name: "asc" },
        select: {
          branch_id: true,
          branch_name: true,
          branch_code: true,
        },
      }),

      prisma.tbl_program.findMany({
        where: { is_active: true },
        orderBy: { program_name: "asc" },
        select: {
          program_id: true,
          program_name: true,
          program_code: true,
        },
      }),

      prisma.tbl_school.findMany({
        orderBy: { school_name: "asc" },
        select: {
          school_id: true,
          school_name: true,
          school_type: true,
          city_municipality: true,
        },
      }),
    ],
  );

  const initialData = {
    applicant_id: applicant.applicant_id,
    application_id: application.application_id,

    last_name: applicant.last_name,
    first_name: applicant.first_name,
    middle_name: applicant.middle_name ?? "",
    suffix: applicant.suffix ?? "",
    sex: applicant.sex ?? "",
    birth_date: applicant.birth_date
      ? applicant.birth_date.toISOString().slice(0, 10)
      : "",
    email: applicant.email ?? "",
    mobile_no: applicant.mobile_no ?? "",

    district_id: String(application.tbl_barangay?.district_id ?? ""),
    barangay_id: String(application.barangay_id ?? ""),
    branch_id: String(application.branch_id ?? ""),
    program_id: String(application.program_id ?? ""),
    school_id: String(application.school_id ?? ""),
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href={`/admission/applicants/${applicantId}`}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          ← Back to Applicant Profile
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Applicant</h1>
          <p className="text-sm text-muted-foreground">
            Update the applicant's information and most recent application.
          </p>
        </div>
      </div>

      <EditApplicantForm
        initialData={initialData}
        districts={districts}
        barangays={barangays}
        branches={branches}
        programs={programs}
        schools={schools}
      />
    </div>
  );
}

export default function EditApplicantPage({ params }: EditApplicantPageProps) {
  return (
    <Suspense fallback={null}>
      <EditApplicantContent params={params} />
    </Suspense>
  );
}
