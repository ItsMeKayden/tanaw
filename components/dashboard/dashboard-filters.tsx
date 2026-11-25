"use client";

import { usePathname } from "next/navigation";

import { ExportMenu } from "@/components/reports/export-menu";

type FilterOption = {
  value: string;
  label: string;
};

type DashboardFiltersProps = {
  selectedSchoolYear: string;
  selectedCampus: string;
  selectedCourse: string;
  schoolYears: FilterOption[];
  campuses: FilterOption[];
  courses: FilterOption[];
  exportHref?: string;
};

export function DashboardFilters({
  selectedSchoolYear,
  selectedCampus,
  selectedCourse,
  schoolYears,
  campuses,
  courses,
  exportHref,
}: DashboardFiltersProps) {
  const pathname = usePathname();

  return (
    <form
      action={pathname}
      method="get"
      className="mt-5 mb-5 flex flex-wrap items-center gap-2"
    >
      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-white px-3 text-sm">
        <span>School Year</span>
        <select
          name="cycle"
          defaultValue={selectedSchoolYear}
          className="border-0 bg-transparent pr-1 outline-none"
        >
          {schoolYears.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-white px-3 text-sm">
        <span>Campus</span>
        <select
          name="campus"
          defaultValue={selectedCampus || "all"}
          className="border-0 bg-transparent pr-1 outline-none"
        >
          <option value="all">All</option>
          {campuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-white px-3 text-sm">
        <span>Course</span>
        <select
          name="course"
          defaultValue={selectedCourse || "all"}
          className="border-0 bg-transparent pr-1 outline-none"
        >
          <option value="all">All</option>
          {courses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="h-9 rounded-md border border-neutral-700 bg-[#eef0fa] px-3 text-sm font-semibold"
      >
        Apply
      </button>

      {exportHref ? (
        <div className="ml-auto">
          <ExportMenu href={exportHref} />
        </div>
      ) : null}
    </form>
  );
}
