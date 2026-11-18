"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useNavigate } from "@/components/ui/pending-navigation";
import { toast } from "@/components/ui/toaster";
import { generateRecommendationsAction, setRecommendationsEnabled } from "@/features/recommendation/actions";

/** Re-scores the cycle's examined applicants. */
export function GenerateButton({ cycleId, label = "Generate recommendations" }: Readonly<{ cycleId: number; label?: string }>) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateRecommendationsAction(cycleId);
            toast.fromResult(result);
            setMessage("error" in result ? { ok: false, text: result.error } : null);
            router.refresh();
          })
        }
        className="h-9 rounded-lg bg-[#191e73] px-4 text-sm font-medium text-white hover:bg-[#232a99] disabled:opacity-60"
      >
        {isPending ? "Generating..." : label}
      </button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`max-w-64 text-right text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** A labelled select that writes its value to a URL search param. */
export function ParamSelect({
  param,
  label,
  value,
  options,
  resetParams = [],
}: Readonly<{
  param: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  resetParams?: string[];
}>) {
  const navigate = useNavigate();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm">
      <span className="text-neutral-700">{label}:</span>
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set(param, event.target.value);
          for (const key of resetParams) next.delete(key);
          navigate(`${pathname}?${next.toString()}`);
        }}
        className="max-w-64 truncate bg-transparent font-medium outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** On/off switch for generating recommendations (Mapping Settings). */
export function RecommendationSwitch({ enabled, canWrite }: Readonly<{ enabled: boolean; canWrite: boolean }>) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    if (!next && !window.confirm("Turn off recommendations? Nothing will be generated or updated until you turn them back on.")) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await setRecommendationsEnabled(next);
      toast.fromResult(result);
      setMessage("error" in result ? { ok: false, text: result.error } : null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={!canWrite || isPending}
        className="group flex items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-green-600" : "bg-neutral-400"
          } ${isPending ? "opacity-60" : ""}`}
        >
          <span
            className={`absolute size-5 rounded-full bg-white shadow transition-[left] ${enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </span>
        <span>
          <span className="block text-sm font-semibold">
            Recommendations {isPending ? "…" : enabled ? "on" : "off"}
          </span>
          <span className="block text-xs text-neutral-600">
            {enabled
              ? "Generated from exam scores and updated when scores or mappings change."
              : "Nothing is generated or updated. Existing results stay visible."}
          </span>
        </span>
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
