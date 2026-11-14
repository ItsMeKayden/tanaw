"use client";

import { usePathname, useRouter } from "next/navigation";

/** Admission cycle picker that stores the choice in ?cycle=. */
export function CycleSelect({
  cycles,
  value,
}: Readonly<{
  cycles: { cycle_id: number; school_year: string; is_active: boolean | null }[];
  value: number | null;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-700">School year</span>
      <select
        value={value ?? ""}
        onChange={(event) => router.push(`${pathname}?cycle=${event.target.value}`)}
        className="h-9 rounded-full border border-neutral-500 bg-white px-3 text-sm"
      >
        {cycles.map((cycle) => (
          <option key={cycle.cycle_id} value={cycle.cycle_id}>
            {cycle.school_year}
            {cycle.is_active ? " (active)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
