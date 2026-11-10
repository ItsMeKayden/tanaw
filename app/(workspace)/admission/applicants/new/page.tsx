import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import AddApplicantForm from "@/components/admission/add-applicant-form";
import Link from "next/link";
import { connection } from "next/server";

async function AddApplicantContent() {
  await connection();

  // Only users with Admission write permission can access this page.
  await requirePermission("admission", "write");

  // Load reference data for the registration form.
  const [districts, barangays, branches, programs, schools, cycles] =
    await Promise.all([
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

      prisma.tbl_admission_cycle.findMany({
        where: { is_active: true },
        orderBy: { start_date: "desc" },
        select: {
          cycle_id: true,
          school_year: true,
        },
      }),
    ]);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href="/admission"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <span aria-hidden="true">←</span>
          Back to Applicants
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Applicant</h1>
          <p className="text-sm text-muted-foreground">
            Register a new applicant and submit their admission application.
          </p>
        </div>
      </div>

      <AddApplicantForm
        districts={districts}
        barangays={barangays}
        branches={branches}
        programs={programs}
        schools={schools}
        cycles={cycles}
      />
    </div>
  );
}

export default function AddApplicantPage() {
  return (
    <Suspense fallback={null}>
      <AddApplicantContent />
    </Suspense>
  );
}
