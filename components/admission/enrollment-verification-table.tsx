"use client";

import { useState } from "react";
import Link from "next/link";

import { ExportMenu } from "@/components/reports/export-menu";

import type { EnrollmentStatus } from "@/features/admission/enrollment-queries";

export type EnrollmentRow = {
  application_id: number;
  applicant_id: number | null;
  full_name: string;
  program_code: string | null;
  status: EnrollmentStatus;
  has_passed_exam: boolean;
  raw_score: number | null;
  max_score: number | null;
  exam_percentage: number | null;
  verified_by: string | null;
  verified_at: string | null;
};

type Filter = "ALL" | EnrollmentStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ENROLLED", label: "Enrolled" },
  { value: "NOT_ENROLLED", label: "Not enrolled" },
  { value: "PENDING", label: "Pending" },
];

const PAGE_SIZE = 10;

function examScore(row: EnrollmentRow) {
  if (row.raw_score !== null && row.max_score) {
    return `${row.raw_score}/${row.max_score}`;
  }
  if (row.exam_percentage !== null) return `${row.exam_percentage}%`;
  return "--";
}

function EnrollmentBadge({ row }: Readonly<{ row: EnrollmentRow }>) {
  if (row.status === "ENROLLED") {
    return (
      <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-medium text-white">
        Enrolled
      </span>
    );
  }
  if (row.status === "NOT_ENROLLED") {
    return (
      <span className="rounded-full bg-neutral-500 px-2.5 py-0.5 text-xs font-medium text-white">
        Not enrolled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-medium text-neutral-900">
      Pending
    </span>
  );
}

export default function EnrollmentVerificationTable({
  rows,
}: Readonly<{ rows: EnrollmentRow[] }>) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const search = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filter !== "ALL" && row.status !== filter) return false;
    if (!search) return true;
    const id = row.applicant_id === null ? "" : String(row.applicant_id).padStart(6, "0");
    return (
      row.full_name.toLowerCase().includes(search) ||
      id.includes(search) ||
      (row.program_code ?? "").toLowerCase().includes(search)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const cell = "border border-neutral-500 px-3 py-2";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by enrollment">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value);
                setPage(1);
              }}
              className={`rounded-full border px-5 py-1 text-sm transition-colors ${
                filter === option.value
                  ? "border-[#191e73] bg-[#191e73] text-white"
                  : "border-neutral-500 bg-neutral-100 hover:bg-neutral-200"
              }`}
            >
              {option.label}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, ID, course"
            aria-label="Search applicants"
            className="h-8 w-full rounded-full border border-neutral-500 bg-white px-4 text-sm outline-none focus:border-[#191e73] sm:w-56"
          />
        </div>

        <ExportMenu
          href="/api/enrollment-verification/export"
          label="Verify with Registrar"
          title="Download the pending list for the Registrar to cross-check"
          primary
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={`${cell} font-medium`}>Applicant ID</th>
              <th className={`${cell} font-medium`}>Name</th>
              <th className={`${cell} font-medium`}>Course</th>
              <th className={`${cell} font-medium`}>Exam score</th>
              <th className={`${cell} font-medium`}>Enrollment</th>
              <th className={`${cell} font-medium`}>Verified by</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <tr key={row.application_id} className="hover:bg-[#e3e4f8]/60">
                  <td className={cell}>
                    {row.applicant_id === null
                      ? "--"
                      : String(row.applicant_id).padStart(6, "0")}
                  </td>
                  <td className={cell}>
                    <Link
                      href={`/admission/enrollment-verification/${row.application_id}`}
                      className="font-medium text-[#191e73] hover:underline"
                    >
                      {row.full_name}
                    </Link>
                  </td>
                  <td className={cell}>{row.program_code ?? "--"}</td>
                  <td className={cell}>{examScore(row)}</td>
                  <td className={cell}>
                    <EnrollmentBadge row={row} />
                  </td>
                  <td className={cell}>
                    {row.verified_by ? (
                      <>
                        {row.verified_by}
                        {row.verified_at && (
                          <span className="block text-xs text-neutral-600">
                            {new Date(row.verified_at).toLocaleDateString("en-PH")}
                          </span>
                        )}
                      </>
                    ) : (
                      "--"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={`${cell} py-10 text-center text-neutral-600`}>
                  {filter !== "ALL" || search
                    ? "No applicants match this filter."
                    : "No passed applicants yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-neutral-600">
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-full border border-neutral-500 bg-white px-4 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-full border border-neutral-500 bg-white px-4 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
