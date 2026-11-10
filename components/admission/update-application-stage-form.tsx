"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplicationStage } from "@/features/admission/actions/update-application-stage";

type AdmissionStage = {
  stage_id: number;
  stage_name: string;
};

type UpdateApplicationStageFormProps = {
  applicationId: number;
  currentStageId: number | null;
  stages: AdmissionStage[];
};

export default function UpdateApplicationStageForm({
  applicationId,
  currentStageId,
  stages,
}: UpdateApplicationStageFormProps) {
  const router = useRouter();

  const [stageId, setStageId] = useState(currentStageId?.toString() ?? "");
  const [remarks, setRemarks] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!stageId) {
      setMessage("Please select an admission stage.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateApplicationStage({
          application_id: applicationId,
          stage_id: Number(stageId),
          remarks,
        });

        setMessage(result.message);
        setRemarks("");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to update admission stage.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor={`stage-${applicationId}`}
          className="text-sm font-medium"
        >
          New Admission Stage
        </label>

        <select
          id={`stage-${applicationId}`}
          value={stageId}
          onChange={(event) => setStageId(event.target.value)}
          disabled={isPending}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          required
        >
          <option value="" disabled>
            Select a stage
          </option>

          {stages.map((stage) => (
            <option key={stage.stage_id} value={stage.stage_id}>
              {stage.stage_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`remarks-${applicationId}`}
          className="text-sm font-medium"
        >
          Remarks (Optional)
        </label>

        <textarea
          id={`remarks-${applicationId}`}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          disabled={isPending}
          rows={3}
          maxLength={1000}
          placeholder="Enter remarks about this stage change..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !stageId || Number(stageId) === currentStageId}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Updating..." : "Update Stage"}
      </button>

      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </form>
  );
}
