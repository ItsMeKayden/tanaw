import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import ApplicantForm from "@/components/admission/applicant-form";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { getApplicantEditData } from "@/features/admission/applicant-edit-data";
import { getApplicantFormReferenceData } from "@/features/admission/applicant-form-data";
import { requirePermission } from "@/lib/authorization";
import { BackLink } from "@/components/ui/back-link";
import { FormSkeleton } from "@/components/ui/skeletons";
import { parseAdmissionStep } from "@/lib/admission-form-url";

type EditApplicantPageProps = Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}>;

async function EditApplicantContent({ params, searchParams }: EditApplicantPageProps) {
  await connection();
  const user = await requirePermission("admission", "write");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const applicantId = Number(id);

  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
    notFound();
  }

  const [data, referenceData] = await Promise.all([
    getApplicantEditData(applicantId),
    getApplicantFormReferenceData(),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <BackLink href={`/admission/applicants/${applicantId}`}>Back to Applicant Profile</BackLink>
      <div>
        <h1 className="text-2xl font-bold">Edit Applicant</h1>
        <p className="text-sm text-neutral-700">
          Update the applicant&apos;s information and most recent application.
        </p>
      </div>

      <ApplicantForm
        userId={user.id}
        mode="edit"
        initialStep={parseAdmissionStep(query.step)}
        initialValues={data.initialValues}
        initialDistrictId={data.initialDistrictId}
        ids={data.ids}
        existingDocuments={data.existingDocuments}
        cancelHref={`/admission/applicants/${applicantId}`}
        {...referenceData}
      />
    </div>
  );
}

export default function EditApplicantPage({ params, searchParams }: EditApplicantPageProps) {
  return (
    <Suspense fallback={<FormSkeleton label="applicant form" />}>
      <EditApplicantContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
