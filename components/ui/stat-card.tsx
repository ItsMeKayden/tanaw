import type { LucideIcon } from "lucide-react";

/** Icon chip colors. Meaning is always also carried by the card's label. */
const TONES = {
  primary: "bg-[#e3e4f8] text-[#191e73]",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
  muted: "bg-neutral-100 text-neutral-600",
} as const;

export type StatTone = keyof typeof TONES;

/** Number card with an icon: label, big value, optional note. */
export function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "primary",
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: number | string;
  note?: string | null;
  tone?: StatTone;
}>) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-500 bg-white/90 p-4">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`} aria-hidden="true">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-tight text-neutral-800">{label}</p>
        <p className="mt-0.5 text-3xl leading-none font-semibold tabular-nums">
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </p>
        {note && <p className="mt-1 text-xs text-neutral-600">{note}</p>}
      </div>
    </div>
  );
}
