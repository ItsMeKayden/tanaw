"use client";

import { useState } from "react";
import Link from "next/link";

import type { RecommendationRow, RecommendationStatus } from "@/features/recommendation/queries";
import { Pagination } from "@/components/ui/pagination";

type Filter = "ALL" | Exclude<RecommendationStatus, "NOT_GENERATED">;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPATIBLE", label: "Compatible" },
  { value: "ALTERNATIVE", label: "Alternative suggested" },
  { value: "BELOW_MINIMUM", label: "Below minimum" },
];

const PAGE_SIZE = 10;
const cell = "border border-neutral-500 px-3 py-2";

function ResultBadge({ status }: Readonly<{ status: RecommendationStatus }>) {
  if (status === "COMPATIBLE") {
    return <span className="rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-white">Compatible</span>;
  }
  if (status === "ALTERNATIVE") {
    return <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-neutral-900">Alternative suggested</span>;
  }
  if (status === "BELOW_MINIMUM") {
    return <span className="rounded-full bg-neutral-500 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-white" title="Below the minimum match for every course, including the preferred one">Below minimum</span>;
  }
  return <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs whitespace-nowrap text-neutral-700">Not generated</span>;
}

export default function RecommendationTable({
  rows,
  courses,
}: Readonly<{
  rows: RecommendationRow[];
  courses: { code: string; name: string }[];
}>) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [course, setCourse] = useState("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const search = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filter !== "ALL" && row.status !== filter) return false;
    if (course !== "ALL" && row.preferred?.code !== course && row.recommended?.code !== course) return false;
    if (!search) return true;
    return row.full_name.toLowerCase().includes(search) || row.application_no.toLowerCase().includes(search);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by result">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value);
                setPage(1);
              }}
              className={`rounded-full border px-4 py-1 text-sm transition-colors ${
                filter === option.value
                  ? "border-neutral-600 bg-neutral-500 text-white"
                  : "border-neutral-500 bg-white hover:bg-neutral-100"
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
            placeholder="Search applicant"
            aria-label="Search applicants"
            className="h-8 w-full rounded-full border border-neutral-500 bg-white px-4 text-sm outline-none focus:border-[#191e73] sm:w-52"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm">
          <span className="text-neutral-700">Course:</span>
          <select
            value={course}
            onChange={(event) => {
              setCourse(event.target.value);
              setPage(1);
            }}
            className="bg-transparent font-medium outline-none"
          >
            <option value="ALL">All</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              {["Applicant", "Score", "Preferred course", "Recommended course", "Match", "Result"].map((heading) => (
                <th key={heading} className={`${cell} font-medium`}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <tr key={row.application_id} className="hover:bg-[#e3e4f8]/60">
                  <td className={cell}>
                    <Link
                      href={`/recommendation/${row.application_id}`}
                      className="font-medium text-[#191e73] hover:underline"
                    >
                      {row.full_name}
                    </Link>
                    <span className="block text-xs text-neutral-600">{row.application_no}</span>
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {row.exam_percentage === null ? "--" : `${row.exam_percentage}%`}
                  </td>
                  <td className={cell}>
                    {row.preferred ? (
                      <span title={row.preferred.name}>
                        {row.preferred.code}
                        {row.preferred_match !== null && (
                          <span className="ml-1 text-xs text-neutral-600 tabular-nums">({row.preferred_match}%)</span>
                        )}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className={cell}>
                    {row.recommended ? <span title={row.recommended.name}>{row.recommended.code}</span> : "--"}
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {row.recommended_match === null ? "--" : `${row.recommended_match}%`}
                  </td>
                  <td className={cell}>
                    <ResultBadge status={row.status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={`${cell} py-10 text-center text-neutral-600`}>
                  {rows.length === 0
                    ? "No applicants have taken the exam in this school year."
                    : "No applicants match this filter."}
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
