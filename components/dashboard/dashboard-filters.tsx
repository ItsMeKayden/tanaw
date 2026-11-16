"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
};

function normalizeYearInput(value: string) {
  return value.trim().replace(/\s*-\s*/g, "-").toLowerCase();
}

function updateQueryParam(
  current: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value === null || value === "all") {
    current.delete(key);
    return;
  }

  current.set(key, value);
}

type FilterMenuProps = {
  label: string;
  options: FilterOption[];
  selected: string;
  type: "school-year" | "campus" | "course";
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
};

function FilterMenu({
  label,
  options,
  selected,
  type,
  open,
  onToggle,
  onClose,
}: FilterMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typedYear, setTypedYear] = useState("");

  const displayOptions =
    type === "campus" || type === "course"
      ? [{ value: "all", label: "All" }, ...options]
      : options;

  const filteredOptions = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return displayOptions;
    return displayOptions.filter((option) => option.label.toLowerCase().includes(text));
  }, [search, displayOptions]);

  const handleToggle = () => {
    if (open) {
      onClose();
      return;
    }

    setSearch("");
    setTypedYear("");
    onToggle();
  };

  const selectOption = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      if (type === "campus") next.delete("campus");
      if (type === "course") next.delete("course");
      if (type === "school-year") next.delete("cycle");

      router.push(`${pathname}?${next.toString()}`);
      onClose();
      setSearch("");
      return;
    }

    if (type === "school-year") updateQueryParam(next, "cycle", value);
    if (type === "campus") updateQueryParam(next, "campus", value);
    if (type === "course") updateQueryParam(next, "course", value);

    router.push(`${pathname}?${next.toString()}`);
    onClose();
    setSearch("");
  };

  const applySchoolYear = () => {
    const match = options.find(
      (option) =>
        normalizeYearInput(option.label) === normalizeYearInput(typedYear),
    );

    if (match) {
      selectOption(match.value);
      setTypedYear("");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-2 rounded-md border border-[#cfcfcf] bg-[#f5f5f5] px-3 py-1.5 text-sm text-neutral-800 shadow-sm"
      >
        <span>{label}</span>
        <ChevronDown className="h-4 w-4 text-neutral-600" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-xl border border-[#c8c8c8] bg-[#d9d9d9] p-3 shadow-lg">
          {type === "school-year" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#c5c5c5] bg-[#eaeaea] p-2">
                <div className="mb-2 flex items-center gap-2 text-neutral-500">
                  <Search className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.08em] text-neutral-500">
                    School year
                  </span>
                </div>
                <input
                  value={typedYear}
                  onChange={(event) => setTypedYear(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applySchoolYear();
                    }
                  }}
                  placeholder="2024 - 2025"
                  className="w-full border-0 bg-transparent text-[15px] text-neutral-700 outline-none placeholder:text-neutral-500"
                />
              </div>

              <button
                type="button"
                onClick={applySchoolYear}
                className="w-full rounded-md border border-[#c5c5c5] bg-[#ececec] px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm"
              >
                Apply
              </button>
            </div>
          )}

          {(type === "campus" || type === "course") && (
            <div className="space-y-2">
              {filteredOptions.map((option) => {
                const checked =
                  option.value === "all"
                    ? !selected
                    : selected === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectOption(option.value)}
                    className={[
                      "flex w-full items-center gap-3 rounded-md border px-2 py-2 text-left text-sm transition-colors",
                      checked
                        ? "border-[#0d1b8c] bg-[#dfe1ff] text-[#1f2a7c]"
                        : "border-transparent bg-[#d9d9d9] text-neutral-700 hover:bg-[#d0d0d0]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px] leading-none",
                        checked
                          ? "border-[#0d1b8c] bg-[#0d1b8c] text-white"
                          : "border-[#4b4b4b] bg-[#efefef] text-transparent",
                      ].join(" ")}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardFilters({
  selectedSchoolYear,
  selectedCampus,
  selectedCourse,
  schoolYears,
  campuses,
  courses,
}: DashboardFiltersProps) {
  const [openMenu, setOpenMenu] = useState<"school-year" | "campus" | "course" | null>(null);

  const toggleMenu = (menu: "school-year" | "campus" | "course") => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const closeAllMenus = () => setOpenMenu(null);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <FilterMenu
        label="School Year"
        type="school-year"
        selected={selectedSchoolYear}
        options={schoolYears}
        open={openMenu === "school-year"}
        onToggle={() => toggleMenu("school-year")}
        onClose={closeAllMenus}
      />
      <FilterMenu
        label="Campus"
        type="campus"
        selected={selectedCampus}
        options={campuses}
        open={openMenu === "campus"}
        onToggle={() => toggleMenu("campus")}
        onClose={closeAllMenus}
      />
      <FilterMenu
        label="Course"
        type="course"
        selected={selectedCourse}
        options={courses}
        open={openMenu === "course"}
        onToggle={() => toggleMenu("course")}
        onClose={closeAllMenus}
      />
      <button
        type="button"
        className="ml-auto rounded-md border border-[#c7c7c7] bg-[#f7f7f7] px-3 py-1.5 text-sm text-neutral-700 shadow-sm"
      >
        Export
      </button>
    </div>
  );
}
