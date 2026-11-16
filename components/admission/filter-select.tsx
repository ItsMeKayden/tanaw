"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Compact filter dropdown that stores its value in one URL search param,
 * keeping the other params. An empty value removes the param ("All").
 */
export function FilterSelect({
  param,
  label,
  value,
  options,
  allLabel,
}: Readonly<{
  param: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** When set, adds an "All" option with an empty value. */
  allLabel?: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => change(event.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-sm border border-neutral-500 bg-white py-0 pr-8 pl-2.5 text-sm text-black outline-none focus-visible:ring-2 focus-visible:ring-[#191e73]/40"
      >
        {allLabel !== undefined && <option value="">{`${label}: ${allLabel}`}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {allLabel === undefined ? option.label : `${label}: ${option.label}`}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 10 6"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 h-2 w-3 fill-black"
      >
        <path d="M0 0h10L5 6z" />
      </svg>
    </label>
  );
}
