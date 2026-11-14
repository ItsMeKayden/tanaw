"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { generateRecommendationsAction } from "@/features/recommendation/actions";

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
            setMessage("error" in result ? { ok: false, text: result.error } : { ok: true, text: result.message });
            router.refresh();
          })
        }
        className="h-9 rounded-lg bg-[#191e73] px-4 text-sm font-medium text-white hover:bg-[#232a99] disabled:opacity-60"
      >
        {isPending ? "Generating..." : label}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>
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
  const router = useRouter();
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
          router.push(`${pathname}?${next.toString()}`);
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
