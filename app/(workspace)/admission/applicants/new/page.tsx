import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import ApplicantForm from "@/components/admission/applicant-form";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { getApplicantFormReferenceData } from "@/features/admission/applicant-form-data";
import { emptyApplicantForm } from "@/features/admission/applicant-form";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

async function AddApplicantContent() {
  await connection();

  // Only users with Admission write permission can access this page.
  await requirePermission("admission", "write");

  const [referenceData, activeCycle] = await Promise.all([
    getApplicantFormReferenceData(),
    prisma.tbl_admission_cycle.findFirst({
      where: { is_active: true },
      orderBy: { start_date: "desc" },
      select: { school_year: true },
    }),
  ]);

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">New Applicant</h1>
          <p className="text-sm text-neutral-700">
            Register a new applicant and submit their admission application.
          </p>
        </div>
        <Link href="/admission" className="text-sm text-neutral-700 hover:text-[#191e73]">
          ← Back to Applicants
        </Link>
      </div>

      <ApplicantForm
        mode="create"
        initialValues={emptyApplicantForm}
        activeCycle={activeCycle?.school_year ?? null}
        cancelHref="/admission"
        {...referenceData}
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
