/**
 * Upload rules for application documents (tbl_application_document).
 * Safe to import from client and server code (no Prisma imports).
 */

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

export const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Documents collected on the Previous School step (all optional). */
export const DOCUMENT_SLOTS = [
  {
    key: "form138",
    documentType: "FORM_138",
    label: "Form 138 / Report card",
  },
  {
    key: "psa",
    documentType: "PSA_BIRTH_CERTIFICATE",
    label: "PSA birth certificate",
  },
] as const;

export type DocumentSlotKey = (typeof DOCUMENT_SLOTS)[number]["key"];

/**
 * Requirements staff verify before an applicant can take the exam (the
 * document types above). When all are verified, the applicant moves to
 * "For Examination" automatically.
 */
export const EXAM_REQUIREMENTS: readonly string[] = DOCUMENT_SLOTS.map((slot) => slot.documentType);

export function documentLabel(documentType: string) {
  return (
    DOCUMENT_SLOTS.find((slot) => slot.documentType === documentType)?.label ??
    documentType
  );
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side check; the server re-validates (including file signature). */
export function validateDocumentFile(file: File): string | null {
  if (!(file.type in ALLOWED_DOCUMENT_TYPES)) {
    return "Only PDF, JPG, or PNG files are allowed.";
  }
  if (file.size === 0) {
    return "The file is empty.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `The file is too large (${formatFileSize(file.size)}). Maximum is 5 MB.`;
  }
  return null;
}
