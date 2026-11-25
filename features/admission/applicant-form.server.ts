// Server-only helpers for the applicant create/update actions.
// Imports Prisma types; do not import from client components.

import type { Prisma } from "@/generated/prisma/client";
import {
  APPLICANT_FORM_FIELDS,
  applicantFormSchema,
  fieldErrorsFrom,
  normalizeMobile,
  type ApplicantFieldErrors,
} from "@/features/admission/applicant-form";
import {
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_SLOTS,
  MAX_DOCUMENT_BYTES,
  type DocumentSlotKey,
} from "@/features/admission/documents";

type Tx = Prisma.TransactionClient;

export type ApplicantActionError = {
  error: string;
  fieldErrors?: ApplicantFieldErrors;
  documentErrors?: Partial<Record<DocumentSlotKey, string>>;
};

export type ParsedApplicantForm = {
  applicant: {
    last_name: string;
    first_name: string;
    middle_name: string | null;
    suffix: string | null;
    sex: string;
    birth_date: Date;
    email: string | null;
    mobile_no: string | null;
  };
  application: {
    barangay_id: number;
    street_address: string;
    branch_id: number;
    program_id: number;
    program_choice_2_id: number | null;
    program_choice_3_id: number | null;
  };
  school:
    | { mode: "existing"; id: number }
    | { mode: "new"; name: string; type: string; city: string };
  documents: {
    key: DocumentSlotKey;
    documentType: string;
    file: File;
    bytes: Uint8Array<ArrayBuffer>;
  }[];
  removeDocuments: string[];
};

/** Checks the file's leading bytes match its declared type. */
function matchesSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  switch (mimeType) {
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    default:
      return false;
  }
}

/** Validates the form's FormData with the same Zod schema the browser uses. */
export async function parseApplicantForm(
  formData: FormData,
): Promise<{ data: ParsedApplicantForm } | ApplicantActionError> {
  const raw: Record<string, string> = {};
  for (const field of APPLICANT_FORM_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : "";
  }

  const parsed = applicantFormSchema.safeParse(raw);
  const fieldErrors: ApplicantFieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
  const documentErrors: Partial<Record<DocumentSlotKey, string>> = {};
  const documents: ParsedApplicantForm["documents"] = [];
  const removeDocuments: string[] = [];

  for (const slot of DOCUMENT_SLOTS) {
    const file = formData.get(`doc_${slot.key}`);

    if (file instanceof File && file.size > 0) {
      if (!(file.type in ALLOWED_DOCUMENT_TYPES)) {
        documentErrors[slot.key] = "Only PDF, JPG, or PNG files are allowed.";
        continue;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        documentErrors[slot.key] = "The file must not exceed 5 MB.";
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesSignature(bytes, file.type)) {
        documentErrors[slot.key] = "The file content does not match its type.";
        continue;
      }
      documents.push({ key: slot.key, documentType: slot.documentType, file, bytes });
    } else if (formData.get(`remove_doc_${slot.key}`) === "1") {
      removeDocuments.push(slot.documentType);
    }
  }

  const firstFieldError = Object.values(fieldErrors)[0];
  const firstDocumentError = Object.values(documentErrors)[0];

  if (!parsed.success || firstFieldError || firstDocumentError) {
    return {
      error: firstFieldError ?? firstDocumentError ?? "Please check the form.",
      fieldErrors,
      documentErrors,
    };
  }

  const values = parsed.data;

  return {
    data: {
      applicant: {
        last_name: values.last_name,
        first_name: values.first_name,
        middle_name: values.middle_name || null,
        suffix: values.suffix || null,
        sex: values.sex,
        birth_date: new Date(`${values.birth_date}T00:00:00.000Z`),
        email: values.email,
        mobile_no: normalizeMobile(values.mobile_no) || null,
      },
      application: {
        barangay_id: Number(values.barangay_id),
        street_address: values.street_address,
        branch_id: Number(values.branch_id),
        program_id: Number(values.program_id),
        program_choice_2_id: values.program_choice_2_id
          ? Number(values.program_choice_2_id)
          : null,
        program_choice_3_id: values.program_choice_3_id
          ? Number(values.program_choice_3_id)
          : null,
      },
      school:
        values.school_entry_mode === "existing"
          ? { mode: "existing", id: Number(values.school_id) }
          : {
              mode: "new",
              name: values.school_name,
              type: values.school_type,
              city: values.school_city,
            },
      documents,
      removeDocuments,
    },
  };
}

/** Throws if any referenced barangay / campus / program is invalid. */
export async function assertReferencesExist(
  tx: Tx,
  application: ParsedApplicantForm["application"],
) {
  const programIds = [
    application.program_id,
    application.program_choice_2_id,
    application.program_choice_3_id,
  ].filter((id): id is number => id !== null);

  const [barangay, branch, activePrograms] = await Promise.all([
    tx.tbl_barangay.findUnique({
      where: { barangay_id: application.barangay_id },
      select: { barangay_id: true },
    }),
    tx.tbl_branch.findFirst({
      where: { branch_id: application.branch_id, is_active: true },
      select: { branch_id: true },
    }),
    tx.tbl_program.count({
      where: { program_id: { in: programIds }, is_active: true },
    }),
  ]);

  if (!barangay) throw new Error("The selected barangay was not found.");
  if (!branch) throw new Error("The selected campus is unavailable.");
  if (activePrograms !== programIds.length) {
    throw new Error("One of the selected programs is unavailable.");
  }
}

/**
 * Existing school: verifies it exists. New school: reuses a school with the
 * same name and type (filling in its city if blank), or registers it.
 */
export async function resolveSchoolId(
  tx: Tx,
  school: ParsedApplicantForm["school"],
) {
  if (school.mode === "existing") {
    const found = await tx.tbl_school.findUnique({
      where: { school_id: school.id },
      select: { school_id: true },
    });
    if (!found) throw new Error("The selected previous school was not found.");
    return found.school_id;
  }

  const existing = await tx.tbl_school.findFirst({
    where: {
      school_name: { equals: school.name, mode: "insensitive" },
      school_type: school.type,
    },
    select: { school_id: true, city_municipality: true },
  });

  if (existing) {
    if (!existing.city_municipality) {
      await tx.tbl_school.update({
        where: { school_id: existing.school_id },
        data: { city_municipality: school.city },
      });
    }
    return existing.school_id;
  }

  const created = await tx.tbl_school.create({
    data: {
      school_name: school.name,
      school_type: school.type,
      city_municipality: school.city,
    },
    select: { school_id: true },
  });

  return created.school_id;
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\- ()]/g, "_").trim();
  return (cleaned || "document").slice(0, 255);
}

/** Inserts/replaces/removes the uploaded documents for an application. */
export async function saveApplicationDocuments(
  tx: Tx,
  applicationId: number,
  accountId: number,
  documents: ParsedApplicantForm["documents"],
  removeDocuments: string[],
) {
  if (removeDocuments.length > 0) {
    await tx.tbl_application_document.deleteMany({
      where: { application_id: applicationId, document_type: { in: removeDocuments } },
    });
  }

  for (const { documentType, file, bytes } of documents) {
    const data = {
      file_name: safeFileName(file.name),
      mime_type: file.type,
      file_size: bytes.byteLength,
      file_data: bytes,
      uploaded_by: accountId,
      uploaded_at: new Date(),
    };

    await tx.tbl_application_document.upsert({
      where: {
        application_id_document_type: {
          application_id: applicationId,
          document_type: documentType,
        },
      },
      update: data,
      create: { application_id: applicationId, document_type: documentType, ...data },
    });
  }
}
