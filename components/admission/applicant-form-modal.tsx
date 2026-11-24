"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import ApplicantForm from "@/components/admission/applicant-form";
import { DiscardWarningModal } from "@/components/admission/discard-warning-modal";
import { Modal } from "@/components/ui/modal";
import { loadApplicantForm, type ApplicantFormReference } from "@/features/admission/actions/load-applicant";
import { emptyApplicantForm } from "@/features/admission/applicant-form";
import type { ApplicantEditData } from "@/features/admission/applicant-edit-data";
import { clearAdmissionFormUrl } from "@/lib/admission-form-url";

export type ApplicantFormRequest =
  | { mode: "create"; initialStep?: number }
  | { mode: "edit"; applicantId: number; subtitle?: string; initialStep?: number };

type Loaded = { edit: ApplicantEditData | null; reference: ApplicantFormReference };

/**
 * Add / edit applicant form in a modal. Loads the applicant (edit) and,
 * when not given, the dropdown data. Closing with unsaved input asks first.
 */
export function ApplicantFormModal({
  userId,
  request,
  reference,
  onClose,
  onSaved,
}: Readonly<{
  /** null = closed. */
  userId: string;
  request: ApplicantFormRequest | null;
  /** Dropdown data the page already has; loaded on open when omitted. */
  reference?: ApplicantFormReference | null;
  onClose: () => void;
  onSaved: (applicantId: number, mode: "create" | "edit") => void;
}>) {
  // Last load result, tagged with the request it belongs to.
  const [result, setResult] = useState<{ key: string; loaded?: Loaded; error?: string } | null>(null);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const requestKey = request ? (request.mode === "edit" ? `edit-${request.applicantId}` : "create") : null;
  // A new applicant needs nothing from the server when the page passed the dropdown data.
  const instant = request?.mode === "create" && reference ? { edit: null, reference } : null;

  useEffect(() => {
    if (!request || !requestKey || instant) return;
    let cancelled = false;

    loadApplicantForm({
      applicantId: request.mode === "edit" ? request.applicantId : undefined,
      withReference: !reference,
    })
      .then((response) => {
        if (cancelled) return;
        setResult(
          "error" in response
            ? { key: requestKey, error: response.error }
            : { key: requestKey, loaded: { edit: response.edit, reference: (reference ?? response.reference)! } },
        );
      })
      .catch(() => !cancelled && setResult({ key: requestKey, error: "Something went wrong while loading the form." }));

    return () => {
      cancelled = true;
    };
    // Reload only when a different applicant / mode is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const current = result?.key === requestKey ? result : null;
  const loaded: Loaded | null = instant ?? current?.loaded ?? null;
  const error = current?.error ?? null;

  function forceClose() {
    setShowCloseWarning(false);
    dirty.current = false;
    clearAdmissionFormUrl();
    setResult(null); // reopening reloads fresh data
    onClose();
  }

  function close(force = false) {
    if (!force && dirty.current) {
      setShowCloseWarning(true);
      return;
    }
    forceClose();
  }

  function saved(applicantId: number, mode: "create" | "edit") {
    dirty.current = false;
    clearAdmissionFormUrl();
    setResult(null);
    onSaved(applicantId, mode);
  }

  const editing = request?.mode === "edit";

  return (
    <Modal
      open={request !== null}
      onOpenChange={(open) => !open && close()}
      title={editing ? "Edit applicant" : "New applicant"}
      description={
        editing
          ? request.subtitle
          : "Register a new applicant and submit their admission application."
      }
      dismissible={false}
      flush
    >
      {error ? (
        <p role="alert" className="m-5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : !loaded || !request ? (
        <p className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading form…
        </p>
      ) : request.mode === "edit" && loaded.edit ? (
        <ApplicantForm
          userId={userId}
          key={requestKey}
          variant="modal"
          mode="edit"
          initialStep={request.initialStep}
          initialValues={loaded.edit.initialValues}
          initialDistrictId={loaded.edit.initialDistrictId}
          ids={loaded.edit.ids}
          existingDocuments={loaded.edit.existingDocuments}
          onCancel={() => close(true)}
          onSuccess={(id) => saved(id, "edit")}
          onDirtyChange={setDirty}
          {...loaded.reference.referenceData}
        />
      ) : (
        <ApplicantForm
          userId={userId}
          key={requestKey}
          variant="modal"
          mode="create"
          initialStep={request.initialStep}
          initialValues={emptyApplicantForm}
          activeCycle={loaded.reference.activeCycle}
          onCancel={() => close(true)}
          onSuccess={(id) => saved(id, "create")}
          onDirtyChange={setDirty}
          {...loaded.reference.referenceData}
        />
      )}
      <DiscardWarningModal
        open={showCloseWarning}
        onKeepEditing={() => setShowCloseWarning(false)}
        onDiscard={forceClose}
      />
    </Modal>
  );
}

/**
 * Button that opens the edit modal (applicant profile). The form refreshes
 * the page itself after saving.
 */
export function EditApplicantButton({
  userId,
  applicantId,
  subtitle,
  initialStep,
  className,
  children,
}: Readonly<{
  userId: string;
  applicantId: number;
  subtitle?: string;
  initialStep?: number;
  className?: string;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <ApplicantFormModal
        userId={userId}
        request={open ? { mode: "edit", applicantId, subtitle, initialStep } : null}
        onClose={() => setOpen(false)}
        onSaved={() => setOpen(false)}
      />
    </>
  );
}
