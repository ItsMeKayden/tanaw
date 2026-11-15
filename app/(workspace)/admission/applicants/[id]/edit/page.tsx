import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import ApplicantForm, { type ExistingDocument } from "@/components/admission/applicant-form";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { getApplicantFormReferenceData } from "@/features/admission/applicant-form-data";
import type { ApplicantFormValues } from "@/features/admission/applicant-form";
import { DOCUMENT_SLOTS, type DocumentSlotKey } from "@/features/admission/documents";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type EditApplicantPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

const str = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

async function EditApplicantContent({ params }: EditApplicantPageProps) {
  await connection();
  await requirePermission("admission", "write");

  const { id } = await params;
  const applicantId = Number(id);

  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
    notFound();
  }

  const [applicant, referenceData] = await Promise.all([
    prisma.tbl_applicant.findUnique({
      where: { applicant_id: applicantId },
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
          orderBy: { application_date: "desc" },
          take: 1,
          select: {
            application_id: true,
            barangay_id: true,
            branch_id: true,
            program_id: true,
            program_choice_2_id: true,
            program_choice_3_id: true,
            school_id: true,
            tbl_barangay: { select: { district_id: true } },
            // Metadata only — never load file_data here.
            tbl_application_document: {
              select: { document_id: true, document_type: true, file_name: true, file_size: true },
            },
          },
        },
      },
    }),
    getApplicantFormReferenceData(),
  ]);

  const application = applicant?.tbl_application[0];

  if (!applicant || !application) {
    notFound();
  }

  const initialValues: ApplicantFormValues = {
    last_name: applicant.last_name,
    first_name: applicant.first_name,
    middle_name: str(applicant.middle_name),
    suffix: str(applicant.suffix),
    sex: str(applicant.sex),
    birth_date: applicant.birth_date?.toISOString().slice(0, 10) ?? "",
    email: str(applicant.email),
    mobile_no: str(applicant.mobile_no),
    barangay_id: str(application.barangay_id),
    branch_id: str(application.branch_id),
    program_id: str(application.program_id),
    program_choice_2_id: str(application.program_choice_2_id),
    program_choice_3_id: str(application.program_choice_3_id),
    // The saved school is picked from the list; switching to "new" starts blank.
    school_entry_mode: application.school_id ? "existing" : "new",
    school_id: str(application.school_id),
    school_name: "",
    school_type: "",
    school_city: "",
  };

  const existingDocuments: Partial<Record<DocumentSlotKey, ExistingDocument>> = {};
  for (const slot of DOCUMENT_SLOTS) {
    const document = application.tbl_application_document.find(
      (doc) => doc.document_type === slot.documentType,
    );
    if (document) {
      existingDocuments[slot.key] = {
        document_id: document.document_id,
        file_name: document.file_name,
        file_size: document.file_size,
      };
    }
  }

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Edit Applicant</h1>
          <p className="text-sm text-neutral-700">
            Update the applicant&apos;s information and most recent application.
          </p>
        </div>
        <Link
          href={`/admission/applicants/${applicantId}`}
          className="text-sm text-neutral-700 hover:text-[#191e73]"
        >
          ← Back to Applicant Profile
        </Link>
      </div>

      <ApplicantForm
        mode="edit"
        initialValues={initialValues}
        initialDistrictId={str(application.tbl_barangay?.district_id)}
        ids={{
          applicant_id: applicant.applicant_id,
          application_id: application.application_id,
        }}
        existingDocuments={existingDocuments}
        cancelHref={`/admission/applicants/${applicant.applicant_id}`}
        {...referenceData}
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
