"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { updateApplicationStage } from "@/features/admission/actions/update-application-stage";
import { MAX_REMARKS, stageUpdateSchema, type StageUpdateValues } from "@/features/admission/schemas";
import { ENROLLMENT_DECISION_STAGES } from "@/features/admission/stages";
import { toast } from "@/components/ui/toaster";

type AdmissionStage = {
  stage_id: number;
  stage_name: string;
};

export default function UpdateApplicationStageForm({
  applicationId,
  currentStageId,
  stages,
}: Readonly<{
  applicationId: number;
  currentStageId: number | null;
  stages: AdmissionStage[];
}>) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    resetField,
    control,
    formState: { errors },
  } = useForm<StageUpdateValues>({
    resolver: zodResolver(stageUpdateSchema),
    defaultValues: { stage_id: currentStageId?.toString() ?? "", remarks: "" },
  });
  const stageId = useWatch({ control, name: "stage_id" });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateApplicationStage({
          application_id: applicationId,
          stage_id: Number(values.stage_id),
          remarks: values.remarks,
        });
        toast.success(result.message);
        resetField("remarks");
        router.refresh();
      } catch (error) {
        const text = error instanceof Error ? error.message : "Failed to update admission stage.";
        setMessage({ ok: false, text });
        toast.error(text);
      }
    });
  });

  const stageFieldId = `stage-${applicationId}`;
  const remarksFieldId = `remarks-${applicationId}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={stageFieldId} className="text-sm font-medium">
          New Admission Stage
        </label>

        <select
          id={stageFieldId}
          {...register("stage_id")}
          disabled={isPending}
          aria-invalid={Boolean(errors.stage_id)}
          aria-describedby={errors.stage_id ? `${stageFieldId}-error` : undefined}
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${errors.stage_id ? "border-red-500" : ""}`}
        >
          <option value="" disabled>
            Select a stage
          </option>

          {stages.map((stage) => {
            // Enrolled / Not Enrolled are set only through Enrollment Verification.
            const locked =
              ENROLLMENT_DECISION_STAGES.includes(stage.stage_name) &&
              stage.stage_id !== currentStageId;

            return (
              <option key={stage.stage_id} value={stage.stage_id} disabled={locked}>
                {stage.stage_name}
                {locked ? " (via Enrollment Verification)" : ""}
              </option>
            );
          })}
        </select>
        {errors.stage_id && (
          <p id={`${stageFieldId}-error`} className="text-xs text-red-600">
            {errors.stage_id.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={remarksFieldId} className="text-sm font-medium">
          Remarks (Optional)
        </label>

        <textarea
          id={remarksFieldId}
          {...register("remarks")}
          disabled={isPending}
          rows={3}
          maxLength={MAX_REMARKS}
          placeholder="Enter remarks about this stage change..."
          aria-invalid={Boolean(errors.remarks)}
          aria-describedby={errors.remarks ? `${remarksFieldId}-error` : undefined}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {errors.remarks && (
          <p id={`${remarksFieldId}-error`} className="text-xs text-red-600">
            {errors.remarks.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !stageId || Number(stageId) === currentStageId}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Updating..." : "Update Stage"}
      </button>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-muted-foreground" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
