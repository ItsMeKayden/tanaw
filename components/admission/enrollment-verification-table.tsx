"use client";

import { useState } from "react";
import Link from "next/link";

import { ExportMenu } from "@/components/reports/export-menu";

import type { EnrollmentStatus } from "@/features/admission/enrollment-queries";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";

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
      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-inset ring-emerald-600">
        Enrolled
      </span>
    );
  }
  if (row.status === "NOT_ENROLLED") {
    return (
      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-300">
        Not enrolled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-300">
      Pending
    </span>
  );
}

/** Opens the verification page: "Verify" while pending, "View" once decided. */
function VerifyButton({ row }: Readonly<{ row: EnrollmentRow }>) {
  const pending = row.status === "PENDING";
  return (
    <Link
      href={`/admission/enrollment-verification/${row.application_id}`}
      aria-label={`${pending ? "Verify enrollment of" : "View enrollment of"} ${row.full_name}`}
      className={`inline-flex h-7 items-center rounded-md px-3 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[#191e73]/30 focus-visible:outline-none ${
        pending
          ? "bg-[#191e73] text-white hover:bg-[#232a99]"
          : "border border-neutral-500 bg-white text-neutral-800 hover:bg-neutral-100"
      }`}
    >
      {pending ? "Verify" : "View"}
    </Link>
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

  const cell = tableStyles.td;

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

      <div className={tableStyles.wrap}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={tableStyles.headRow}>
              <th className={tableStyles.th}>Applicant ID</th>
              <th className={tableStyles.th}>Name</th>
              <th className={tableStyles.th}>Course</th>
              <th className={tableStyles.th}>Exam score</th>
              <th className={tableStyles.th}>Enrollment</th>
              <th className={tableStyles.th}>Verified by</th>
              <th className={`${tableStyles.th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody className={tableStyles.body}>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <tr key={row.application_id} className={tableStyles.row}>
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
                  <td className={`${cell} text-right`}>
                    <VerifyButton row={row} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className={tableStyles.empty}>
                  {filter !== "ALL" || search
                    ? "No applicants match this filter."
                    : "No passed applicants yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        start={filtered.length === 0 ? 0 : start + 1}
        end={Math.min(start + PAGE_SIZE, filtered.length)}
        total={filtered.length}
        noun="applicants"
        onPageChange={setPage}
      />
    </div>
  );
}
