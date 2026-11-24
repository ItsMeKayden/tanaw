"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import type { RecommendationRow, RecommendationStatus } from "@/features/recommendation/queries";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";

type Filter = "ALL" | Exclude<RecommendationStatus, "NOT_GENERATED">;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPATIBLE", label: "Compatible" },
  { value: "ALTERNATIVE", label: "Alternative suggested" },
  { value: "BELOW_MINIMUM", label: "Below minimum" },
];

const PAGE_SIZE = 10;
const cell = tableStyles.td;
const headCell = tableStyles.th;
const fieldClass =
  "h-9 rounded-full border border-neutral-500 bg-white text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

function ResultBadge({ status }: Readonly<{ status: RecommendationStatus }>) {
  if (status === "COMPATIBLE") {
    return <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-green-800 ring-1 ring-inset ring-green-200">Compatible</span>;
  }
  if (status === "ALTERNATIVE") {
    return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-900 ring-1 ring-inset ring-amber-300">Alternative suggested</span>;
  }
  if (status === "BELOW_MINIMUM") {
    return <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-red-800 ring-1 ring-inset ring-red-200" title="Below the minimum match for every course, including the preferred one">Below minimum</span>;
  }
  return <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs whitespace-nowrap text-neutral-600 ring-1 ring-inset ring-neutral-300">Not generated</span>;
}

/** Course code with its match % on one line and an optional note below. */
function CourseMatch({
  course,
  match,
  note,
  warning = false,
}: Readonly<{
  course: { code: string; name: string } | null;
  match: number | null;
  note: string | null;
  /** Show the note as an advisory warning (subject minimums not met). */
  warning?: boolean;
}>) {
  if (!course) return <span className="text-neutral-500">--</span>;
  return (
    <div title={course.name}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{course.code}</span>
        {match !== null && <span className="tabular-nums">{match}%</span>}
      </div>
      {note && (
        <span className={`block text-xs ${warning ? "font-medium text-red-700" : "text-neutral-500"}`}>{note}</span>
      )}
    </div>
  );
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
              className={`h-9 rounded-full border px-4 text-sm whitespace-nowrap transition-colors ${
                filter === option.value
                  ? "border-[#191e73] bg-[#191e73] font-semibold text-white"
                  : "border-neutral-500 bg-white hover:bg-neutral-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search applicants</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or application no."
              className={`${fieldClass} w-full pr-4 pl-9`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-700">Course</span>
            <select
              value={course}
              onChange={(event) => {
                setCourse(event.target.value);
                setPage(1);
              }}
              className={`${fieldClass} px-3 font-medium`}
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
      </div>

      <div className={tableStyles.wrap}>
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[11%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className={tableStyles.headRow}>
              <th className={headCell}>Applicant</th>
              <th className={`${headCell} text-right`}>Exam score</th>
              <th className={headCell}>Preferred course</th>
              <th className={headCell}>Recommended course</th>
              <th className={headCell}>Result</th>
            </tr>
          </thead>
          <tbody className={tableStyles.body}>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <tr key={row.application_id} className={tableStyles.row}>
                  <td className={cell}>
                    <Link
                      href={`/recommendation/${row.application_id}`}
                      className="font-medium text-[#191e73] hover:underline"
                    >
                      {row.full_name}
                    </Link>
                    <span className="block text-xs text-neutral-600">{row.application_no}</span>
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {row.exam_percentage === null ? "--" : `${row.exam_percentage}%`}
                  </td>
                  <td className={cell}>
                    <CourseMatch
                      course={row.preferred}
                      match={row.preferred_match}
                      warning={row.shortfalls.length > 0}
                      note={
                        !row.preferred
                          ? null
                          : row.shortfalls.length > 0
                            ? `Below min.: ${row.shortfalls.map((f) => (f.min === null ? f.label : `${f.label} ${f.min}%`)).join(", ")}`
                            : `min. ${row.min_match}%`
                      }
                    />
                  </td>
                  <td className={cell}>
                    <CourseMatch
                      course={row.recommended}
                      match={row.recommended_match}
                      note={row.recommended && row.recommended.id === row.preferred?.id ? "Same as preferred" : null}
                    />
                  </td>
                  <td className={cell}>
                    <ResultBadge status={row.status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className={tableStyles.empty}>
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
