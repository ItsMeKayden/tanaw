"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";

import { setRequirementVerified } from "@/features/admission/actions/requirements";
import { toast } from "@/components/ui/toaster";

/**
 * Verified / not verified for one requirement (Form 138, PSA). Verifying the
 * last one clears the applicant for the exam (done on the server).
 */
export function RequirementToggle({
  applicationId,
  requirement,
  label,
  verified,
  verifiedBy,
  verifiedAt,
  canWrite,
}: Readonly<{
  applicationId: number;
  requirement: string;
  label: string;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setRequirementVerified(applicationId, requirement, !verified);
      toast.fromResult(result);
      if (!("error" in result)) router.refresh();
    });
  }

  const who = verified ? [verifiedBy, verifiedAt].filter(Boolean).join(" · ") : null;

  if (!canWrite) {
    return verified ? (
      <span className="inline-flex flex-col">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Verified
        </span>
        {who && <span className="text-xs text-neutral-500">{who}</span>}
      </span>
    ) : (
      <span className="text-sm text-neutral-500">Not verified</span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={verified}
        aria-label={`${label}: ${verified ? "verified (click to undo)" : "mark as verified"}`}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60 print:hidden ${
          verified
            ? "border-green-600 bg-green-50 text-green-800 hover:bg-green-100"
            : "border-neutral-400 bg-white text-neutral-700 hover:border-[#191e73] hover:text-[#191e73]"
        }`}
      >
        {verified ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
        {isPending ? "Saving…" : verified ? "Verified" : "Mark verified"}
      </button>
      {who && <span className="text-xs text-neutral-500">{who}</span>}
    </span>
  );
}
