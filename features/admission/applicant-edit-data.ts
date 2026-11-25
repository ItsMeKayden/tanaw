// Server-side loader for the "Edit applicant" form (page and modal).
import type { ExistingDocument } from "@/components/admission/applicant-form";
import type { ApplicantFormValues } from "@/features/admission/applicant-form";
import { DOCUMENT_SLOTS, type DocumentSlotKey } from "@/features/admission/documents";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICANT } from "@/features/admission/archive-core";

const str = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export type ApplicantEditData = {
  initialValues: ApplicantFormValues;
  initialDistrictId: string;
  ids: { applicant_id: number; application_id: number };
  existingDocuments: Partial<Record<DocumentSlotKey, ExistingDocument>>;
};

/** Form values for an applicant and their most recent application, or null. */
export async function getApplicantEditData(applicantId: number): Promise<ApplicantEditData | null> {
  const applicant = await prisma.tbl_applicant.findUnique({
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
      tbl_application: {
        orderBy: { application_date: "desc" },
        take: 1,
        select: {
          application_id: true,
          barangay_id: true,
          street_address: true,
          branch_id: true,
          program_id: true,
          program_choice_2_id: true,
          program_choice_3_id: true,
          school_id: true,
          tbl_barangay: { select: { district_id: true } },
          // Metadata only — never load file_data here.
          tbl_application_document: {
            select: { document_id: true, document_type: true, file_name: true, file_size: true, mime_type: true },
          },
        },
      },
    },
  });

  const application = applicant?.tbl_application[0];
  if (!applicant || !application) return null;

  const existingDocuments: Partial<Record<DocumentSlotKey, ExistingDocument>> = {};
  for (const slot of DOCUMENT_SLOTS) {
    const document = application.tbl_application_document.find((doc) => doc.document_type === slot.documentType);
    if (document) {
      existingDocuments[slot.key] = {
        document_id: document.document_id,
        file_name: document.file_name,
        file_size: document.file_size,
        mime_type: document.mime_type,
      };
    }
  }

  return {
    initialValues: {
      last_name: applicant.last_name,
      first_name: applicant.first_name,
      middle_name: str(applicant.middle_name),
      suffix: str(applicant.suffix),
      sex: str(applicant.sex),
      birth_date: applicant.birth_date?.toISOString().slice(0, 10) ?? "",
      email: str(applicant.email),
      mobile_no: str(applicant.mobile_no),
      barangay_id: str(application.barangay_id),
      street_address: str(application.street_address),
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
    },
    initialDistrictId: str(application.tbl_barangay?.district_id),
    ids: { applicant_id: applicant.applicant_id, application_id: application.application_id },
    existingDocuments,
  };
}
