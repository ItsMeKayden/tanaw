"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { DiscardWarningModal } from "@/components/admission/discard-warning-modal";
import { DatePicker } from "@/components/ui/date-picker";
import { DocumentPreview } from "@/components/admission/document-preview";
import {
  APPLICANT_FORM_FIELDS,
  MAX_APPLICANT_AGE,
  MIN_APPLICANT_AGE,
  MOBILE_LENGTH,
  SCHOOL_TYPES,
  applicantFormSchema,
  inputFilters,
  isoYearsAgo,
  type ApplicantFieldErrors,
  type ApplicantFormField,
  type ApplicantFormValues,
} from "@/features/admission/applicant-form";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_SLOTS,
  formatFileSize,
  validateDocumentFile,
  type DocumentSlotKey,
} from "@/features/admission/documents";
import { apiPost } from "@/lib/api-client";
import { clearAdmissionFormUrl, updateAdmissionFormUrl } from "@/lib/admission-form-url";

type District = {
  district_id: number;
  district_name: string;
  barangays: { barangay_id: number; barangay_name: string }[];
};
type Branch = { branch_id: number; branch_name: string; branch_code: string };
type Program = {
  program_id: number;
  program_code: string;
  program_name: string;
};
type School = {
  school_id: number;
  school_name: string;
  school_type: string | null;
  city_municipality: string | null;
};

export type ExistingDocument = {
  document_id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
};

type ApplicantFormProps = Readonly<{
  userId: string;
  mode: "create" | "edit";
  initialValues: ApplicantFormValues;
  initialDistrictId?: string;
  ids?: { applicant_id: number; application_id: number };
  districts: District[];
  branches: Branch[];
  programs: Program[];
  schools: School[];
  activeCycle?: string | null;
  existingDocuments?: Partial<Record<DocumentSlotKey, ExistingDocument>>;
  /** Page mode: where Cancel goes. Ignored when onCancel is given. */
  cancelHref?: string;
  /** Modal mode: called instead of navigating away on Cancel. */
  onCancel?: () => void;
  /** Modal mode: called after a successful save instead of opening the profile. */
  onSuccess?: (applicantId: number) => void;
  /** Modal mode: reports unsaved changes so closing the modal can confirm. */
  onDirtyChange?: (dirty: boolean) => void;
  /** "modal" drops the lavender panel and pins the buttons to the bottom. */
  variant?: "page" | "modal";
  /** Step to open on (edit mode can jump to any step, e.g. 2 = Documents). */
  initialStep?: number;
}>;

const STEPS = [
  "Personal info",
  "Course and campus",
  "Previous school",
  "Review",
];

/** Fields validated when leaving each step, in on-screen order. */
const STEP_FIELDS: ApplicantFormField[][] = [
  [
    "last_name",
    "first_name",
    "middle_name",
    "suffix",
    "birth_date",
    "sex",
    "email",
    "mobile_no",
    "barangay_id",
    "street_address",
  ],
  ["program_id", "program_choice_2_id", "program_choice_3_id", "branch_id"],
  [
    "school_entry_mode",
    "school_id",
    "school_name",
    "school_type",
    "school_city",
  ],
  [],
];

type ErrorKey = ApplicantFormField | "district_id";
type ApplicantFormOutput = z.output<typeof applicantFormSchema>;

// ----- visual tokens (shared look with the other admission screens) -----
const NAVY = "#191e73";
const panelClass =
  "rounded-xl border border-[#9fa3e0] bg-[#e3e4f8]/85 p-5 shadow-sm backdrop-blur-[1px] sm:p-6";
const labelClass = "text-sm text-neutral-800";

function inputClass(hasError: boolean, extra = "") {
  return `h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70 ${
    hasError
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
      : "border-neutral-500 focus:border-[#191e73] focus:ring-[#191e73]/20"
  } ${extra}`;
}

function ErrorText({
  id,
  children,
}: Readonly<{ id: string; children?: string }>) {
  if (!children) return null;
  return (
    <p id={id} className="text-xs text-red-600">
      {children}
    </p>
  );
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  className = "",
  children,
}: Readonly<{
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <ErrorText id={`${id}-error`}>{error}</ErrorText>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-neutral-600">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Applied → Exam → Result → Enrolled style progress, used for the form steps. */
/**
 * Compact one-row stepper for the modal: small numbered dots with the label
 * beside them (labels of other steps hide on narrow screens).
 */
function CompactStepper({
  current,
  furthest,
  onSelect,
}: Readonly<{
  current: number;
  furthest: number;
  onSelect: (step: number) => void;
}>) {
  return (
    <nav aria-label="Application form progress" className="border-b border-neutral-200 pb-3">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, index) => {
          const done = index < current;
          const active = index === current;
          const reachable = index <= furthest && !active;
          const isLast = index === STEPS.length - 1;

          let dot = "border border-neutral-400 bg-white text-neutral-600";
          if (done) dot = "bg-green-600 text-white";
          else if (active) dot = "bg-[#191e73] text-white";

          return (
            <li key={label} className={`flex min-w-0 items-center gap-2 ${isLast ? "" : "flex-1"}`}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${label}${done ? " (completed)" : ""}`}
                className="group flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-1.5 enabled:cursor-pointer disabled:cursor-default"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${dot}`}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={`truncate text-sm group-enabled:group-hover:underline ${
                    active ? "font-semibold text-neutral-950" : "hidden text-neutral-600 sm:inline"
                  }`}
                >
                  {label}
                </span>
              </button>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`h-px min-w-3 flex-1 ${done ? "bg-green-600" : "bg-neutral-300"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Stepper({
  current,
  furthest,
  onSelect,
}: Readonly<{
  current: number;
  furthest: number;
  onSelect: (step: number) => void;
}>) {
  return (
    <nav
      aria-label="Application form progress"
      className="-mx-5 border-b border-[#9fa3e0] px-2 pb-5 sm:-mx-6 sm:px-8"
    >
      <ol className="flex items-start">
        {STEPS.map((label, index) => {
          const done = index < current;
          const active = index === current;
          const reachable = index <= furthest && !active;
          const isLast = index === STEPS.length - 1;

          let circle = "border-2 border-neutral-500 bg-white text-neutral-600";
          if (done)
            circle = "border-2 border-green-700 bg-green-600 text-white";
          else if (active)
            circle =
              "border-2 border-[#191e73] bg-[#191e73] text-white ring-4 ring-[#191e73]/15";

          return (
            <li
              key={label}
              className={`flex items-start ${isLast ? "" : "flex-1"}`}
            >
              <div className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-28">
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  disabled={!reachable}
                  aria-current={active ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${label}${done ? " (completed)" : ""}`}
                  className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-transform enabled:cursor-pointer enabled:hover:scale-105 disabled:cursor-default ${circle}`}
                >
                  {done ? (
                    <Check
                      className="size-5"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  ) : (
                    index + 1
                  )}
                </button>
                <span
                  className={`text-center text-xs leading-tight sm:text-sm ${
                    active
                      ? "font-semibold text-neutral-950"
                      : "text-neutral-700"
                  }`}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mt-[17px] h-0.5 flex-1 rounded ${index < current ? "bg-[#5b4a4a]" : "bg-neutral-300"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DocumentUpload({
  slotKey,
  label,
  file,
  existing,
  removeExisting,
  error,
  onFile,
  onError,
  onToggleRemove,
}: Readonly<{
  slotKey: DocumentSlotKey;
  label: string;
  file: File | null;
  existing?: ExistingDocument;
  removeExisting: boolean;
  error?: string;
  onFile: (file: File | null) => void;
  onError: (message: string | null) => void;
  onToggleRemove: () => void;
}>) {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = `doc-${slotKey}`;

  // Local preview of a picked file before it is uploaded.
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object URLs must be created and revoked in an effect
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validateDocumentFile(candidate);
    onError(problem);
    if (!problem) onFile(candidate);
  }

  let status: ReactNode = (
    <span className="text-neutral-700">
      Drag a file here or click to upload
    </span>
  );
  if (file) {
    status = (
      <span className="font-medium text-[#191e73]">
        {file.name} · {formatFileSize(file.size)}
      </span>
    );
  } else if (existing && !removeExisting) {
    status = (
      <span className="font-medium text-[#191e73]">
        Current: {existing.file_name} · {formatFileSize(existing.file_size)}
      </span>
    );
  } else if (existing && removeExisting) {
    status = (
      <span className="text-red-600">
        Current file will be removed when you save
      </span>
    );
  }

  let zone = "border-neutral-500 bg-white/40 hover:bg-white/70";
  if (error) zone = "border-red-500 bg-red-50/60";
  else if (isDragging) zone = "border-[#191e73] bg-white";
  else if (file || (existing && !removeExisting))
    zone = "border-green-600 bg-white/70";

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${zone}`}
      >
        <span className="font-semibold text-neutral-900">{label}</span>
        {status}
        <span className="text-xs text-neutral-500">
          PDF, JPG, or PNG · max 5 MB
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {file && fileUrl && (
        <DocumentPreview
          src={fileUrl}
          fileName={file.name}
          mimeType={file.type}
          title={`${label} (not saved yet)`}
          meta={formatFileSize(file.size)}
          allowDownload={false}
        />
      )}
      {!file && existing && !removeExisting && (
        <DocumentPreview
          src={`/api/documents/${existing.document_id}`}
          fileName={existing.file_name}
          mimeType={existing.mime_type}
          title={label}
          meta={formatFileSize(existing.file_size)}
        />
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {file && (
          <button
            type="button"
            onClick={() => onFile(null)}
            className="text-red-600 hover:underline"
          >
            Remove selected file
          </button>
        )}
        {!file && existing && (
          <>
            <button
              type="button"
              onClick={onToggleRemove}
              className={
                removeExisting
                  ? "text-[#191e73] hover:underline"
                  : "text-red-600 hover:underline"
              }
            >
              {removeExisting ? "Keep current file" : "Remove current file"}
            </button>
          </>
        )}
      </div>
      <ErrorText id={`${inputId}-error`}>{error}</ErrorText>
    </div>
  );
}

/** One row of the review sheet: numbered title + Edit on the left, details on the right. */
function ReviewSection({
  number,
  title,
  onEdit,
  children,
}: Readonly<{
  number: number;
  title: string;
  onEdit: () => void;
  children: ReactNode;
}>) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[13rem_1fr] md:gap-6">
      <div className="flex items-start justify-between gap-2 md:flex-col md:justify-start">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-green-600 text-white">
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
          <span>
            <span className="sr-only">Step {number}: </span>
            {title}
          </span>
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-neutral-500 px-3 py-0.5 text-xs hover:bg-neutral-100 md:ml-8"
        >
          Edit
        </button>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReviewGrid({ rows }: Readonly<{ rows: [string, ReactNode][] }>) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-neutral-600">{label}</dt>
          <dd className="text-sm font-medium wrap-break-word text-neutral-900">
            {value || "--"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ApplicantForm({
  userId,
  mode,
  initialValues,
  initialDistrictId = "",
  ids,
  districts,
  branches,
  programs,
  schools,
  activeCycle,
  existingDocuments = {},
  cancelHref = "/admission",
  onCancel,
  onSuccess,
  onDirtyChange,
  variant = "page",
  initialStep = 0,
}: ApplicantFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const restoredStep = Math.min(Math.max(0, initialStep), STEPS.length - 1);
  const [step, setStep] = useState(restoredStep);

  // A new step starts at the top of the modal's scroll area. Done before
  // paint and without animation, so it never competes with the step fade.
  useLayoutEffect(() => {
    if (variant === "modal" && scrollArea.current) scrollArea.current.scrollTop = 0;
  }, [step, variant]);
  const [furthest, setFurthest] = useState(
    mode === "edit" ? STEPS.length - 1 : restoredStep,
  );

  // Form state and validation: React Hook Form + the shared Zod schema.
  const {
    register,
    control: formControl,
    setValue,
    trigger,
    setError,
    clearErrors,
    getFieldState,
    formState,
  } = useForm<ApplicantFormValues, unknown, ApplicantFormOutput>({
    resolver: zodResolver(applicantFormSchema),
    defaultValues: initialValues,
    mode: "onTouched",
  });

  // Inputs are controlled below, so fields are registered without refs.
  useEffect(() => {
    for (const field of APPLICANT_FORM_FIELDS) register(field);
  }, [register]);

  const values: ApplicantFormValues = { ...initialValues, ...useWatch({ control: formControl }) };
  const [districtId, setDistrictId] = useState(initialDistrictId);
  const [districtError, setDistrictError] = useState<string | null>(null);
  const [files, setFiles] = useState<Partial<Record<DocumentSlotKey, File>>>(
    {},
  );
  const [removeDocs, setRemoveDocs] = useState<
    Partial<Record<DocumentSlotKey, boolean>>
  >({});
  const [docErrors, setDocErrors] = useState<
    Partial<Record<DocumentSlotKey, string>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const errors: Partial<Record<ErrorKey, string>> = {};
  for (const field of APPLICANT_FORM_FIELDS) {
    const message = formState.errors[field]?.message;
    if (message) errors[field] = message;
  }
  if (districtError) errors.district_id = districtError;

  const selectedDistrict = districts.find(
    (d) => String(d.district_id) === districtId,
  );
  const barangays = selectedDistrict?.barangays ?? [];
  const selectedBarangay = barangays.find(
    (b) => String(b.barangay_id) === values.barangay_id,
  );
  const selectedBranch = branches.find(
    (b) => String(b.branch_id) === values.branch_id,
  );
  const selectedSchool = schools.find(
    (s) => String(s.school_id) === values.school_id,
  );
  const isExistingSchool = values.school_entry_mode === "existing";

  const hasAnyInput =
    mode === "create" &&
    Object.entries(values).some(
      ([key, val]) =>
        key !== "school_entry_mode" &&
        val !== undefined &&
        val !== null &&
        val !== "",
    );

  const isDirty =
    formState.isDirty ||
    hasAnyInput ||
    (districtId ?? "") !== (initialDistrictId ?? "") ||
    Object.keys(files).length > 0 ||
    Object.values(removeDocs).some(Boolean);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    updateAdmissionFormUrl(
      mode,
      ids?.applicant_id,
      step,
      variant === "modal",
    );
  }, [mode, ids?.applicant_id, step, variant]);

  const programLabel = (id: string | undefined) => {
    const program = programs.find((p) => String(p.program_id) === id);
    return program ? `${program.program_code} – ${program.program_name}` : "";
  };

  // ----- validation -----

  function validateDistrict(value: string) {
    return value ? null : "District is required.";
  }

  function setFieldError(key: ErrorKey, message: string | null) {
    if (key === "district_id") setDistrictError(message);
  }

  /**
   * Updates fields. Any field already showing an error is re-validated, so
   * errors clear as you fix them (including cross-field rules).
   */
  function update(patch: Partial<ApplicantFormValues>) {
    for (const [field, value] of Object.entries(patch) as [ApplicantFormField, string][]) {
      setValue(field, value, { shouldDirty: true, shouldTouch: true });
    }
    const shown = APPLICANT_FORM_FIELDS.filter((field) => formState.errors[field]);
    if (shown.length > 0) void trigger(shown);
  }

  function control(
    field: ApplicantFormField,
    extraClass = "",
    hasHint = false,
  ) {
    const id = `field-${field}`;
    const error = errors[field];
    let describedBy: string | undefined;
    if (error) describedBy = `${id}-error`;
    else if (hasHint) describedBy = `${id}-hint`;

    return {
      id,
      name: field,
      value: values[field] ?? "",
      "aria-invalid": Boolean(error),
      "aria-describedby": describedBy,
      onBlur: () => {
        void trigger(field);
      },
      className: inputClass(Boolean(error), extraClass),
    };
  }

  function focusFirst(keys: ErrorKey[]) {
    requestAnimationFrame(() => {
      for (const key of keys) {
        const element =
          formRef.current?.querySelector<HTMLElement>(`#field-${key}`) ??
          formRef.current?.querySelector<HTMLElement>(`[name="${key}"]`);
        if (element) {
          // preventScroll: let the smooth scroll below move it, not an instant focus jump.
          element.focus({ preventScroll: true });
          element.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      }
    });
  }

  /** Validates one step, shows its errors, and focuses the first problem. */
  async function validateStep(index: number) {
    const fields = STEP_FIELDS[index];
    const valid = fields.length === 0 ? true : await trigger(fields);
    let districtOk = true;
    if (index === 0) {
      const message = validateDistrict(districtId);
      setDistrictError(message);
      districtOk = !message;
    }

    if (!valid || !districtOk) {
      const order: ErrorKey[] =
        // District has no form field; it sits on screen just before the barangay.
        index === 0 ? fields.flatMap((key): ErrorKey[] => (key === "barangay_id" ? ["district_id", key] : [key])) : fields;
      const invalid = order.filter((key) =>
        key === "district_id" ? !districtOk : getFieldState(key).invalid,
      );
      setStep(index);
      focusFirst(invalid);
      return false;
    }
    if (index === 2 && Object.keys(docErrors).length > 0) {
      setStep(2);
      return false;
    }
    return true;
  }

  async function goTo(target: number) {
    setSubmitError("");
    if (target <= step) {
      setStep(target);
      return;
    }
    for (let index = step; index < target; index++) {
      if (!(await validateStep(index))) return;
    }
    setStep(target);
    setFurthest((value) => Math.max(value, target));
  }

  function performCancel() {
    if (onCancel) onCancel();
    else router.push(cancelHref);
  }

  function cancel() {
    if (isDirty) {
      setShowCancelModal(true);
      return;
    }
    performCancel();
  }

  function confirmDiscard() {
    setShowCancelModal(false);
    performCancel();
  }

  function finish(applicantId: number) {
    clearAdmissionFormUrl();
    if (onSuccess) onSuccess(applicantId);
    else router.push(`/admission/applicants/${applicantId}`);
  }

  function applyServerErrors(
    fieldErrors?: ApplicantFieldErrors,
    documentErrors?: Partial<Record<DocumentSlotKey, string>>,
  ) {
    if (documentErrors && Object.keys(documentErrors).length > 0) {
      setDocErrors(documentErrors);
      setStep(2);
    }
    if (!fieldErrors || Object.keys(fieldErrors).length === 0) return;

    for (const [field, message] of Object.entries(fieldErrors) as [ApplicantFormField, string][]) {
      setError(field, { type: "server", message });
    }
    const index = STEP_FIELDS.findIndex((fields) =>
      fields.some((field) => fieldErrors[field]),
    );
    if (index >= 0) {
      setStep(index);
      focusFirst(STEP_FIELDS[index].filter((field) => fieldErrors[field]));
    }
  }

  async function submit() {
    setSubmitError("");
    clearErrors();
    for (let index = 0; index < STEPS.length - 1; index++) {
      if (!(await validateStep(index))) {
        setSubmitError("Please fix the highlighted fields before submitting.");
        return;
      }
    }

    const payload = new FormData();
    for (const [field, value] of Object.entries(values))
      payload.set(field, value ?? "");
    for (const slot of DOCUMENT_SLOTS) {
      const file = files[slot.key];
      if (file) payload.set(`doc_${slot.key}`, file);
      else if (removeDocs[slot.key]) payload.set(`remove_doc_${slot.key}`, "1");
    }

    startTransition(async () => {
      try {
        if (mode === "edit") {
          payload.set("applicant_id", String(ids!.applicant_id));
          payload.set("application_id", String(ids!.application_id));
        }
        const response = await apiPost(
          "/api/admission/applicants",
          { body: payload },
          { userId },
        );
        const result = (await response.json()) as
          | { success: true; applicantId?: number }
          | { error: string; fieldErrors?: ApplicantFieldErrors; documentErrors?: Partial<Record<DocumentSlotKey, string>> };
        if (!response.ok || "error" in result) {
          setSubmitError("error" in result ? result.error : "The applicant could not be saved.");
          if ("error" in result) applyServerErrors(result.fieldErrors, result.documentErrors);
          return;
        }
        if (mode === "create") {
          if (typeof result.applicantId !== "number") {
            setSubmitError("The server did not confirm the applicant submission.");
            return;
          }
          finish(result.applicantId);
        } else {
          finish(ids!.applicant_id);
        }
        router.refresh();
      } catch {
        setSubmitError(
          "Something went wrong. If you attached files, make sure each is under 5 MB and try again.",
        );
      }
    });
  }

  // ----- review values -----
  const fullName = [
    values.first_name,
    values.middle_name,
    values.last_name,
    values.suffix,
  ]
    .filter(Boolean)
    .join(" ");
  const address = [
    values.street_address,
    selectedBarangay && `Brgy. ${selectedBarangay.barangay_name}`,
    selectedDistrict?.district_name,
    "Quezon City",
  ]
    .filter(Boolean)
    .join(", ");
  const schoolSummary = isExistingSchool
    ? {
        name: selectedSchool?.school_name,
        type: selectedSchool?.school_type,
        city: selectedSchool?.city_municipality,
      }
    : {
        name: values.school_name,
        type: values.school_type,
        city: values.school_city,
      };
  const documentNames = DOCUMENT_SLOTS.filter(
    (slot) =>
      files[slot.key] || (existingDocuments[slot.key] && !removeDocs[slot.key]),
  ).map((slot) => slot.label);

  let primaryLabel = "Next";
  if (step === STEPS.length - 1) {
    if (isPending) primaryLabel = "Saving...";
    else
      primaryLabel = mode === "create" ? "Submit application" : "Save changes";
  }

  const choiceFields = [
    ["program_id", "1st choice"],
    ["program_choice_2_id", "2nd choice"],
    ["program_choice_3_id", "3rd choice"],
  ] as const;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (step === STEPS.length - 1) submit();
        else goTo(step + 1);
      }}
      className={variant === "modal" ? "flex min-h-0 flex-1 flex-col" : "space-y-4"}
    >
      {/* Stepper and the current step share one panel; in a modal it is the
          scrolling area (no visible scrollbar) above the fixed footer. */}
      <div
        ref={scrollArea}
        className={
          variant === "modal"
            ? "scrollbar-none min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pt-3 pb-4"
            : panelClass
        }
      >
        {variant === "modal" ? (
          <CompactStepper current={step} furthest={furthest} onSelect={goTo} />
        ) : (
          <Stepper current={step} furthest={furthest} onSelect={goTo} />
        )}

        {/* (1) Personal info */}
        <section
          hidden={step !== 0}
          className="pt-5 animate-in fade-in duration-150 ease-out motion-reduce:animate-none"
          aria-labelledby="step-0-title"
        >
          <h2 id="step-0-title" className="text-lg font-semibold">
            Personal information
          </h2>
          <p className="mb-4 text-sm text-neutral-700">
            Fields marked * are required.
          </p>

          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              id="field-last_name"
              label="Last name"
              required
              error={errors.last_name}
            >
              <input
                {...control("last_name")}
                onChange={(e) => update({ last_name: inputFilters.name(e.target.value) })}
                maxLength={100}
                placeholder="e.g. Dela Cruz"
                autoComplete="family-name"
              />
            </Field>
            <Field
              id="field-first_name"
              label="First name"
              required
              error={errors.first_name}
            >
              <input
                {...control("first_name")}
                onChange={(e) => update({ first_name: inputFilters.name(e.target.value) })}
                maxLength={100}
                placeholder="e.g. Juan"
                autoComplete="given-name"
              />
            </Field>
            <Field
              id="field-middle_name"
              label="Middle name (Optional)"
              error={errors.middle_name}
            >
              <input
                {...control("middle_name")}
                onChange={(e) => update({ middle_name: inputFilters.name(e.target.value) })}
                maxLength={100}
                placeholder="e.g. Santos"
                autoComplete="additional-name"
              />
            </Field>
            <Field
              id="field-suffix"
              label="Suffix (Optional)"
              error={errors.suffix}
            >
              <input
                {...control("suffix")}
                onChange={(e) => update({ suffix: inputFilters.suffix(e.target.value) })}
                maxLength={20}
                placeholder="e.g. Jr., III"
                autoComplete="honorific-suffix"
              />
            </Field>

            <Field
              id="field-birth_date"
              label="Birthdate"
              required
              error={errors.birth_date}
            >
              <DatePicker
                id="field-birth_date"
                value={values.birth_date ?? ""}
                onChange={(value) => update({ birth_date: value })}
                onClose={() => void trigger("birth_date")}
                // Applicants are MIN–MAX years old today.
                min={isoYearsAgo(MAX_APPLICANT_AGE)}
                max={isoYearsAgo(MIN_APPLICANT_AGE)}
                defaultMonth={isoYearsAgo(18)}
                placeholder="Select birthdate"
                invalid={Boolean(errors.birth_date)}
                describedBy={errors.birth_date ? "field-birth_date-error" : undefined}
                className={inputClass(Boolean(errors.birth_date))}
              />
            </Field>
            <Field id="field-sex" label="Sex" required error={errors.sex}>
              <select
                {...control("sex", values.sex ? "" : "text-neutral-400")}
                onChange={(e) => update({ sex: e.target.value })}
              >
                <option value="" disabled>
                  Select sex
                </option>
                <option value="Male" className="text-black">Male</option>
                <option value="Female" className="text-black">Female</option>
              </select>
            </Field>
            <Field id="field-email" label="Email" required error={errors.email}>
              <input
                {...control("email")}
                onChange={(e) => update({ email: inputFilters.email(e.target.value) })}
                type="email"
                maxLength={150}
                placeholder="e.g. juan.delacruz@gmail.com"
                autoComplete="email"
              />
            </Field>
            <Field
              id="field-mobile_no"
              label="Mobile number (Optional)"
              error={errors.mobile_no}
            >
              <input
                {...control("mobile_no")}
                onChange={(e) => update({ mobile_no: inputFilters.mobile(e.target.value) })}
                type="tel"
                inputMode="numeric"
                maxLength={MOBILE_LENGTH}
                placeholder="e.g. 09171234567"
                autoComplete="tel"
              />
            </Field>

            <Field
              id="field-district_id"
              label="District"
              required
              error={errors.district_id}
              className="sm:col-span-1 lg:col-span-2"
            >
              <select
                id="field-district_id"
                value={districtId}
                aria-invalid={Boolean(errors.district_id)}
                aria-describedby={
                  errors.district_id ? "field-district_id-error" : undefined
                }
                onChange={(e) => {
                  setDistrictId(e.target.value);
                  update({ barangay_id: "" });
                  if (errors.district_id)
                    setFieldError(
                      "district_id",
                      validateDistrict(e.target.value),
                    );
                }}
                onBlur={() =>
                  setFieldError("district_id", validateDistrict(districtId))
                }
                className={inputClass(Boolean(errors.district_id), districtId ? "" : "text-neutral-400")}
              >
                <option value="" disabled>
                  Select district
                </option>
                {districts.map((district) => (
                  <option
                    key={district.district_id}
                    value={district.district_id}
                    className="text-black"
                  >
                    {district.district_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="field-barangay_id"
              label="Barangay"
              required
              error={errors.barangay_id}
              hint={districtId ? undefined : "Select a district first"}
              className="sm:col-span-1 lg:col-span-2"
            >
              <select
                {...control("barangay_id", values.barangay_id ? "" : "text-neutral-400", !districtId)}
                onChange={(e) => update({ barangay_id: e.target.value })}
                disabled={!districtId}
              >
                <option value="" disabled>
                  {districtId ? "Select barangay" : "Select a district first"}
                </option>
                {barangays.map((barangay) => (
                  <option
                    key={barangay.barangay_id}
                    value={barangay.barangay_id}
                    className="text-black"
                  >
                    {barangay.barangay_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="field-street_address"
              label="House no. / Street / Subdivision"
              required
              error={errors.street_address}
              className="sm:col-span-2 lg:col-span-4"
            >
              <input
                {...control("street_address")}
                onChange={(e) => update({ street_address: e.target.value.replace(/^\s+/, "") })}
                maxLength={150}
                placeholder="e.g. 123 Mabini St., Villa Verde Subd."
                autoComplete="address-line1"
              />
            </Field>
          </div>
        </section>

        {/* (2) Course and campus */}
        <section
          hidden={step !== 1}
          className="pt-5 animate-in fade-in duration-150 ease-out motion-reduce:animate-none"
          aria-labelledby="step-1-title"
        >
          <h2 id="step-1-title" className="text-lg font-semibold">
            Preferred course and campus
          </h2>
          <p className="mb-4 text-xs text-neutral-600">
            Fields marked * are required. The 1st choice is the program applied to. 2nd and 3rd choices are optional alternatives.
          </p>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {choiceFields.map(([field, label], index) => {
              // A program can only be picked once across the three choices.
              const takenElsewhere = new Set(
                choiceFields
                  .filter(([other]) => other !== field)
                  .map(([other]) => values[other])
                  .filter(Boolean),
              );
              const isFirst = index === 0;

              return (
                <Field
                  key={field}
                  id={`field-${field}`}
                  label={label}
                  required={isFirst}
                  error={errors[field]}
                >
                  <select
                    {...control(field, isFirst ? "bg-[#f7f1e3]" : "")}
                    onChange={(e) => {
                      const patch: Partial<ApplicantFormValues> = {
                        [field]: e.target.value,
                      };
                      // Clearing the 2nd choice also clears the 3rd.
                      if (field === "program_choice_2_id" && !e.target.value)
                        patch.program_choice_3_id = "";
                      update(patch);
                    }}
                    disabled={
                      field === "program_choice_3_id" &&
                      !values.program_choice_2_id
                    }
                  >
                    <option value="" disabled={isFirst}>
                      {isFirst ? "Select 1st choice program" : "None (optional)"}
                    </option>
                    {programs.map((program) => (
                      <option
                        key={program.program_id}
                        value={program.program_id}
                        disabled={takenElsewhere.has(
                          String(program.program_id),
                        )}
                      >
                        {program.program_code} – {program.program_name}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </div>

          <fieldset
            className="mt-5"
            aria-describedby={
              errors.branch_id ? "field-branch_id-error" : "campus-note"
            }
          >
            <legend className={labelClass}>
              Preferred campus
              <span className="text-red-600" aria-hidden="true">
                {" "}
                *
              </span>
            </legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {branches.map((branch, index) => {
                const checked = values.branch_id === String(branch.branch_id);
                return (
                  <label
                    key={branch.branch_id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-sm transition-colors ${
                      checked
                        ? "border-[#191e73] ring-2 ring-[#191e73]/20"
                        : errors.branch_id
                          ? "border-red-500"
                          : "border-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      id={index === 0 ? "field-branch_id" : undefined}
                      type="radio"
                      name="branch_id"
                      value={branch.branch_id}
                      checked={checked}
                      onChange={(e) => update({ branch_id: e.target.value })}
                      className="size-4 accent-[#191e73]"
                    />
                    <span>
                      <span className="block font-medium">
                        {branch.branch_name.replace(/ Campus$/, "")}
                      </span>
                      <span className="text-xs text-neutral-600">
                        {branch.branch_code}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.branch_id ? (
              <ErrorText id="field-branch_id-error">
                {errors.branch_id}
              </ErrorText>
            ) : (
              <p
                id="campus-note"
                className="mt-1.5 text-xs text-neutral-600 italic"
              >
                Campus availability depends on the program selected.
              </p>
            )}
          </fieldset>

          {mode === "create" && (
            <p className="mt-4 text-xs text-neutral-700">
              Admission cycle:{" "}
              <span className="font-medium">
                {activeCycle ?? "No active admission cycle"}
              </span>
            </p>
          )}
        </section>

        {/* (3) Previous school */}
        <section
          hidden={step !== 2}
          className="pt-5 animate-in fade-in duration-150 ease-out motion-reduce:animate-none"
          aria-labelledby="step-2-title"
        >
          <h2 id="step-2-title" className="text-lg font-semibold">
            Previous school
          </h2>
          <p className="mb-4 text-xs text-neutral-600">
            Fields marked * are required. Pick the school from the list, or add it if it isn&apos;t listed yet.
          </p>

          <div
            role="radiogroup"
            aria-label="Previous school entry"
            className="mb-4 inline-flex rounded-full border border-neutral-500 bg-white p-1"
          >
            {(
              [
                ["existing", "Select existing school"],
                ["new", "Add a new school"],
              ] as const
            ).map(([value, label]) => {
              const active = values.school_entry_mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ school_entry_mode: value })}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[#191e73] font-semibold text-white"
                      : "text-neutral-800 hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {isExistingSchool ? (
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                id="field-school_id"
                label="School name"
                required
                error={errors.school_id}
                hint={
                  schools.length === 0
                    ? "No schools are registered yet. Choose “Add a new school”."
                    : undefined
                }
                className="sm:col-span-2"
              >
                <select
                  {...control("school_id", values.school_id ? "" : "text-neutral-400", schools.length === 0)}
                  onChange={(e) => update({ school_id: e.target.value })}
                >
                  <option value="" disabled>
                    Select previous school
                  </option>
                  {schools.map((school) => (
                    <option key={school.school_id} value={school.school_id} className="text-black">
                      {school.school_name}
                      {school.city_municipality
                        ? ` — ${school.city_municipality}`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="existing-school-type" label="School type">
                <input
                  id="existing-school-type"
                  readOnly
                  tabIndex={-1}
                  value={selectedSchool?.school_type ?? ""}
                  placeholder="--"
                  className={inputClass(false, "bg-neutral-100")}
                />
              </Field>
              <Field id="existing-school-city" label="City / municipality">
                <input
                  id="existing-school-city"
                  readOnly
                  tabIndex={-1}
                  value={selectedSchool?.city_municipality ?? ""}
                  placeholder="--"
                  className={inputClass(false, "bg-neutral-100")}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                id="field-school_name"
                label="School name"
                required
                error={errors.school_name}
                className="sm:col-span-2"
              >
                <input
                  {...control("school_name")}
                  onChange={(e) => update({ school_name: inputFilters.schoolName(e.target.value) })}
                  maxLength={150}
                  placeholder="e.g. Quezon City Science High School"
                />
              </Field>
              <fieldset
                aria-describedby={
                  errors.school_type ? "field-school_type-error" : undefined
                }
              >
                <legend className={labelClass}>
                  School type
                  <span className="text-red-600" aria-hidden="true">
                    {" "}
                    *
                  </span>
                </legend>
                <div className="mt-2.5 flex gap-6">
                  {SCHOOL_TYPES.map((type, index) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        id={index === 0 ? "field-school_type" : undefined}
                        type="radio"
                        name="school_type"
                        value={type}
                        checked={values.school_type === type}
                        onChange={(e) =>
                          update({ school_type: e.target.value })
                        }
                        className="size-4 accent-[#191e73]"
                      />
                      {type}
                    </label>
                  ))}
                </div>
                <ErrorText id="field-school_type-error">
                  {errors.school_type}
                </ErrorText>
              </fieldset>
              <Field
                id="field-school_city"
                label="City / municipality"
                required
                error={errors.school_city}
              >
                <input
                  {...control("school_city")}
                  onChange={(e) => update({ school_city: inputFilters.place(e.target.value) })}
                  maxLength={100}
                  placeholder="e.g. Quezon City"
                />
              </Field>
            </div>
          )}

          <div className="mt-6">
            <h3 className="font-semibold">Supporting documents</h3>
            <p className="mb-3 text-sm text-neutral-700">
              Optional — you can also upload these later through Edit.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {DOCUMENT_SLOTS.map((slot) => (
                <DocumentUpload
                  key={slot.key}
                  slotKey={slot.key}
                  label={slot.label}
                  file={files[slot.key] ?? null}
                  existing={existingDocuments[slot.key]}
                  removeExisting={Boolean(removeDocs[slot.key])}
                  error={docErrors[slot.key]}
                  onFile={(file) =>
                    setFiles((previous) => {
                      const next = { ...previous };
                      if (file) next[slot.key] = file;
                      else delete next[slot.key];
                      return next;
                    })
                  }
                  onError={(message) =>
                    setDocErrors((previous) => {
                      const next = { ...previous };
                      if (message) next[slot.key] = message;
                      else delete next[slot.key];
                      return next;
                    })
                  }
                  onToggleRemove={() =>
                    setRemoveDocs((previous) => ({
                      ...previous,
                      [slot.key]: !previous[slot.key],
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </section>

        {/* (4) Review */}
        <section
          hidden={step !== 3}
          className="pt-5 animate-in fade-in duration-150 ease-out motion-reduce:animate-none"
          aria-labelledby="step-3-title"
        >
          <h2 id="step-3-title" className="text-lg font-semibold">
            Review
          </h2>
          <p className="mb-4 text-sm text-neutral-700">
            Check everything before{" "}
            {mode === "create" ? "submitting" : "saving"}. Use Edit to go back
            to a section.
          </p>

          {/* Summary header */}
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-400 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-[#e3e4f8] text-lg font-semibold"
              >
                {(values.first_name.trim().charAt(0) || "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{fullName || "--"}</p>
                <p className="text-sm text-neutral-700">
                  {programs.find(
                    (p) => String(p.program_id) === values.program_id,
                  )?.program_code ?? "No program"}
                  {" · "}
                  {selectedBranch?.branch_name ?? "No campus"}
                  {mode === "create" && activeCycle
                    ? ` · S.Y. ${activeCycle}`
                    : ""}
                </p>
              </div>
            </div>
            <span className="w-fit rounded-full bg-[#e3e4f8] px-3 py-1 text-xs font-medium text-[#191e73]">
              {mode === "create"
                ? "Status on submit: Application Submitted"
                : "Editing existing application"}
            </span>
          </div>

          <div className="divide-y divide-neutral-300 rounded-xl border border-neutral-400 bg-white">
            <ReviewSection
              number={1}
              title="Personal info"
              onEdit={() => goTo(0)}
            >
              <ReviewGrid
                rows={[
                  ["Full name", fullName],
                  ["Birthdate", values.birth_date],
                  ["Sex", values.sex],
                  ["Email", values.email],
                  ["Mobile number", values.mobile_no],
                  ["Address", address],
                ]}
              />
            </ReviewSection>

            <ReviewSection
              number={2}
              title="Course and campus"
              onEdit={() => goTo(1)}
            >
              <ol className="space-y-2">
                {choiceFields.map(([field, label], index) => (
                  <li key={field} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        index === 0
                          ? "bg-[#191e73] text-white"
                          : "border border-neutral-400 text-neutral-700"
                      }`}
                      aria-label={label}
                    >
                      {index + 1}
                    </span>
                    <span
                      className={
                        values[field] ? "text-neutral-900" : "text-neutral-500"
                      }
                    >
                      {programLabel(values[field]) || "No choice"}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3">
                <ReviewGrid
                  rows={[["Preferred campus", selectedBranch?.branch_name]]}
                />
              </div>
            </ReviewSection>

            <ReviewSection
              number={3}
              title="Previous school"
              onEdit={() => goTo(2)}
            >
              <ReviewGrid
                rows={[
                  ["School", schoolSummary.name],
                  ["Type", schoolSummary.type],
                  ["City / municipality", schoolSummary.city],
                  [
                    "Entry",
                    isExistingSchool
                      ? "Existing school"
                      : "New school (will be registered)",
                  ],
                ]}
              />
              <p className="mt-3 mb-1.5 text-xs text-neutral-600">
                Supporting documents ({documentNames.length} of{" "}
                {DOCUMENT_SLOTS.length})
              </p>
              <ul className="space-y-1.5">
                {DOCUMENT_SLOTS.map((slot) => {
                  const fileName =
                    files[slot.key]?.name ??
                    (removeDocs[slot.key]
                      ? null
                      : existingDocuments[slot.key]?.file_name);
                  return (
                    <li
                      key={slot.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      {fileName ? (
                        <Check
                          className="size-4 shrink-0 text-green-600"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="size-4 shrink-0 rounded-full border-2 border-neutral-400"
                        />
                      )}
                      <span className="font-medium">{slot.label}:</span>
                      <span
                        className={
                          fileName
                            ? "truncate text-neutral-800"
                            : "text-amber-700"
                        }
                      >
                        {fileName ?? "Not uploaded"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </ReviewSection>
          </div>

          {mode === "create" && (
            <p className="mt-4 text-xs text-neutral-700">
              The application number and date are generated when you submit.
            </p>
          )}
        </section>
      </div>

      {submitError && (
        <p
          role="alert"
          className={`rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 ${
            variant === "modal" ? "mx-5 mb-3 shrink-0" : ""
          }`}
        >
          {submitError}
        </p>
      )}

      {/* Navigation (the modal's fixed footer; only the content above scrolls) */}
      <div
        className={`flex items-center justify-between gap-3 ${
          variant === "modal" ? "shrink-0 border-t border-neutral-200 bg-neutral-50 px-5 py-3" : ""
        }`}
      >
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="rounded-lg border border-neutral-500 bg-neutral-100 px-4 py-1.5 text-sm shadow-sm hover:bg-neutral-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={isPending}
              className="rounded-full border border-neutral-500 bg-white px-6 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            style={{ backgroundColor: NAVY }}
            className="rounded-full px-6 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
      <DiscardWarningModal
        open={showCancelModal}
        onKeepEditing={() => setShowCancelModal(false)}
        onDiscard={confirmDiscard}
      />
    </form>
  );
}
