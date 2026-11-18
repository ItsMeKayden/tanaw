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
import { toast } from "@/components/ui/toaster";

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { success: true; message: string } | { error: string };

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
  decision,
}: Readonly<{
  applicationId: number;
  stageName: string | null;
  canDecide: boolean;
  canEnroll: boolean;
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
  const [isPending, startTransition] = useTransition();

  const isPassed = stageName === ADMISSION_STAGES.PASSED;
  const isEnrolled = stageName === ADMISSION_STAGES.ENROLLED;
  const isNotEnrolled = stageName === ADMISSION_STAGES.NOT_ENROLLED;

  function run(action: () => Promise<ActionResult>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await action();
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
                run(
                  () => reopenEnrollment({ application_id: applicationId }),
                  "Return this applicant to pending verification (Passed)?",
                )
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
                run(
                  () => markNotEnrolled({ application_id: applicationId, remarks: checked.data.remarks }),
                  "Mark this applicant as NOT enrolled?",
                );
              })}
              className={secondaryButton}
            >
              Mark as Not Enrolled
            </button>
            <button
              type="button"
              disabled={isPending || !canEnroll}
              onClick={handleSubmit((values) =>
                run(
                  () => verifyEnrollment({ application_id: applicationId, remarks: values.remarks }),
                  "Mark this applicant as Enrolled?",
                ),
              )}
              className={primaryButton}
            >
              {isPending ? "Saving..." : "Mark as Enrolled"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
