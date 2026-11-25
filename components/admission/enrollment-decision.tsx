"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  markNotEnrolled,
  reopenEnrollment,
  verifyEnrollment,
} from "@/features/admission/actions/enrollment-verification";
import { ADMISSION_STAGES } from "@/features/admission/stages";
import {
  MAX_REMARKS,
  enrollmentDecisionSchema,
  notEnrolledSchema,
  type EnrollmentDecisionValues,
} from "@/features/admission/schemas";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { toast } from "@/components/ui/toaster";

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { success: true; message: string } | { error: string };
type PendingConfirmation = {
  title: string;
  heading: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "warning" | "danger";
  action: () => Promise<ActionResult>;
};

const primaryButton =
  "rounded-full bg-[#191e73] px-5 py-1.5 text-sm font-semibold text-white hover:bg-[#232a99] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "rounded-full border border-neutral-500 bg-white px-5 py-1.5 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50";

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EnrollmentDecision({
  applicationId,
  stageName,
  canDecide,
  canEnroll,
  enrollBlockedReason = null,
  decision,
}: Readonly<{
  applicationId: number;
  stageName: string | null;
  canDecide: boolean;
  canEnroll: boolean;
  /** Shown next to a disabled "Mark as Enrolled" (e.g. documents not verified). */
  enrollBlockedReason?: string | null;
  decision: { by: string | null; at: string | null; remarks: string | null } | null;
}>) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<EnrollmentDecisionValues>({
    resolver: zodResolver(enrollmentDecisionSchema),
    defaultValues: { remarks: "" },
  });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [isPending, startTransition] = useTransition();

  const isPassed = stageName === ADMISSION_STAGES.PASSED;
  const isEnrolled = stageName === ADMISSION_STAGES.ENROLLED;
  const isNotEnrolled = stageName === ADMISSION_STAGES.NOT_ENROLLED;

  function confirmAction() {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    setFeedback(null);

    startTransition(async () => {
      const result = await action();
      setPendingConfirm(null);
      if ("error" in result) {
        setFeedback({ type: "error", text: result.error });
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      reset({ remarks: "" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {(isEnrolled || isNotEnrolled) && (
        <section
          className={`rounded-xl border p-4 text-sm ${
            isEnrolled
              ? "border-green-300 bg-green-50 text-green-900"
              : "border-neutral-400 bg-neutral-100 text-neutral-900"
          }`}
        >
          <p className="font-semibold">
            {isEnrolled ? "Enrollment verified" : "Marked as not enrolled"}
          </p>
          <p>
            {decision?.by ? `By ${decision.by}` : "By unknown user"}
            {decision?.at ? ` · ${formatDateTime(decision.at)}` : ""}
          </p>
          {decision?.remarks && <p className="mt-1">Remarks: {decision.remarks}</p>}

          {isNotEnrolled && canDecide && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                setPendingConfirm({
                  title: "Revert to Passed?",
                  heading: "Return applicant to pending verification",
                  description:
                    "Are you sure you want to return this applicant to pending verification (Passed)?",
                  confirmLabel: "Revert to Passed",
                  tone: "warning",
                  action: () => reopenEnrollment({ application_id: applicationId }),
                })
              }
              className={`${secondaryButton} mt-3`}
            >
              Revert to Passed
            </button>
          )}
        </section>
      )}

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${
            feedback.type === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {isPassed && canDecide && (
        <section className="space-y-3 rounded-xl border border-neutral-500 bg-white/90 p-4">
          <div>
            <h2 className="text-lg font-semibold">Enrollment decision</h2>
            <p className="text-sm text-neutral-600">
              Confirm with the Registrar that the applicant completed
              enrollment, then record the outcome. It is saved to the stage
              history with your name.
            </p>
          </div>

          <textarea
            {...register("remarks")}
            disabled={isPending}
            rows={3}
            maxLength={MAX_REMARKS}
            placeholder="Remarks (required when marking as not enrolled)"
            aria-label="Enrollment decision remarks"
            aria-invalid={Boolean(errors.remarks)}
            aria-describedby={errors.remarks ? "decision-remarks-error" : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${
              errors.remarks ? "border-red-500" : "border-neutral-500"
            }`}
          />
          {errors.remarks && (
            <p id="decision-remarks-error" className="text-xs text-red-600">
              {errors.remarks.message}
            </p>
          )}

          {enrollBlockedReason && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              {enrollBlockedReason}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit((values) => {
                // A reason is required only for "Not Enrolled".
                const checked = notEnrolledSchema.safeParse(values);
                if (!checked.success) {
                  setError("remarks", { type: "required", message: checked.error.issues[0].message });
                  return;
                }
                setPendingConfirm({
                  title: "Mark as Not Enrolled?",
                  heading: "Confirm non-enrollment decision",
                  description:
                    "Are you sure you want to mark this applicant as NOT enrolled? This decision will be recorded in the stage history with your name.",
                  confirmLabel: "Mark as Not Enrolled",
                  tone: "danger",
                  action: () =>
                    markNotEnrolled({
                      application_id: applicationId,
                      remarks: checked.data.remarks,
                    }),
                });
              })}
              className={secondaryButton}
            >
              Mark as Not Enrolled
            </button>
            <button
              type="button"
              disabled={isPending || !canEnroll}
              title={enrollBlockedReason ?? undefined}
              onClick={handleSubmit((values) =>
                setPendingConfirm({
                  title: "Mark as Enrolled?",
                  heading: "Confirm applicant enrollment",
                  description:
                    "Are you sure you want to mark this applicant as Enrolled? This decision will be recorded in the stage history with your name.",
                  confirmLabel: "Mark as Enrolled",
                  tone: "primary",
                  action: () =>
                    verifyEnrollment({
                      application_id: applicationId,
                      remarks: values.remarks,
                    }),
                }),
              )}
              className={primaryButton}
            >
              {isPending ? "Saving..." : "Mark as Enrolled"}
            </button>
          </div>
        </section>
      )}

      <ConfirmModal
        open={pendingConfirm !== null}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={confirmAction}
        title={pendingConfirm?.title ?? ""}
        heading={pendingConfirm?.heading}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={
          isPending ? "Saving..." : (pendingConfirm?.confirmLabel ?? "Confirm")
        }
        tone={pendingConfirm?.tone ?? "primary"}
        isPending={isPending}
      />
    </div>
  );
}
