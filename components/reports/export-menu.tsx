import { ChevronDown } from "lucide-react";

import type { ExportFormat } from "@/features/reports/report";

const LABELS: Record<ExportFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  pdf: "PDF report (.pdf)",
};

/**
 * Export dropdown: links to an export route with ?format=… appended.
 * Uses <details> so it works without client JavaScript.
 */
export function ExportMenu({
  href,
  label = "Export",
  formats = ["xlsx", "csv", "pdf"],
  primary = false,
  title,
}: Readonly<{
  href: string;
  label?: string;
  formats?: ExportFormat[];
  primary?: boolean;
  title?: string;
}>) {
  const join = href.includes("?") ? "&" : "?";

  return (
    <details className="group relative">
      <summary
        title={title}
        className={`inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden ${
          primary
            ? "bg-[#191e73] text-white hover:bg-[#232a99]"
            : "border border-neutral-600 bg-white hover:bg-neutral-100"
        }`}
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-neutral-300 bg-white py-1 text-sm shadow-lg">
        {formats.map((format) => (
          <li key={format}>
            <a href={`${href}${join}format=${format}`} className="block px-3 py-1.5 hover:bg-[#e3e4f8]">
              {LABELS[format]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
