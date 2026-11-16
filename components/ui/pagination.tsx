"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const buttonClass =
  "inline-flex h-8 items-center gap-1 rounded-md border border-neutral-500 bg-white px-3 text-sm text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-[#191e73]/30 focus-visible:outline-none";
const disabledClass = `${buttonClass} pointer-events-none opacity-40`;

/**
 * The one pagination bar used by every table: "Showing a–b of n" on the
 * left, Previous / Page x of y / Next on the right. Pass onPageChange for
 * client-side tables, or prevHref / nextHref for server-paged lists.
 */
export function Pagination({
  page,
  totalPages,
  start,
  end,
  total,
  noun = "records",
  onPageChange,
  prevHref,
  nextHref,
}: Readonly<{
  page: number;
  totalPages: number;
  /** 1-based index of the first row shown (0 when empty). */
  start: number;
  end: number;
  total: number;
  /** Plural noun for the summary, e.g. "applicants". */
  noun?: string;
  onPageChange?: (page: number) => void;
  prevHref?: string | null;
  nextHref?: string | null;
}>) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const control = (direction: "prev" | "next") => {
    const enabled = direction === "prev" ? hasPrev : hasNext;
    const href = direction === "prev" ? prevHref : nextHref;
    const label =
      direction === "prev" ? (
        <>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </>
      ) : (
        <>
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </>
      );

    if (!enabled) {
      return (
        <span className={disabledClass} aria-disabled="true">
          {label}
        </span>
      );
    }
    if (href) {
      return (
        <Link href={href} className={buttonClass} rel={direction}>
          {label}
        </Link>
      );
    }
    return (
      <button type="button" onClick={() => onPageChange?.(direction === "prev" ? page - 1 : page + 1)} className={buttonClass}>
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-neutral-700 tabular-nums">
        Showing {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {noun}
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-2">
        {control("prev")}
        <span className="px-1 text-sm text-neutral-800 tabular-nums">
          Page {page} of {totalPages}
        </span>
        {control("next")}
      </nav>
    </div>
  );
}
