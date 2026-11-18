import { PendingLink } from "@/components/ui/pending-navigation";
import Link from "next/link";

/*
 * Chart colors (validated categorical pair, light surface):
 *   applicant = #2a78d6 (blue), course/requirement = #eb6834 (orange).
 * Single-series charts use one hue; identity always comes from labels too.
 */
const APPLICANT = "#2a78d6";
const COURSE = "#eb6834";

function Legend({ items }: Readonly<{ items: { label: string; color: string }[] }>) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-neutral-800" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Applicant score vs required score per competency (both 0–100%). */
export function ScoreVsRequirementChart({
  rows,
}: Readonly<{ rows: { label: string; score: number | null; required: number | null }[] }>) {
  return (
    <figure className="space-y-4">
      <Legend
        items={[
          { label: "Applicant score", color: APPLICANT },
          { label: "Course requirement", color: COURSE },
        ]}
      />
      <div className="space-y-4">
        {rows.map((row, rowIndex) => (
          <div key={row.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
            <span className="text-sm text-neutral-800">{row.label}</span>
            <div className="space-y-0.5">
              {(
                [
                  ["Applicant", row.score, APPLICANT],
                  ["Required", row.required, COURSE],
                ] as const
              ).map(([series, value, color]) => (
                <div
                  key={series}
                  title={`${row.label} · ${series}: ${value === null ? "not applicable" : `${value}%`}`}
                  className="flex items-center gap-2"
                >
                  <div className="h-3 flex-1 rounded-r-[4px] bg-neutral-100">
                    <div
                      className="chart-bar h-full rounded-r-[4px]"
                      style={{
                        width: `${Math.min(100, value ?? 0)}%`,
                        backgroundColor: color,
                        animationDelay: `${rowIndex * 60}ms`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-neutral-800 tabular-nums">
                    {value === null ? "—" : `${value}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-neutral-600">Scale 0–100%. The table lists the same values.</figcaption>
    </figure>
  );
}

/** Rank shades, navy (best match) to gray (weakest); text color per step for contrast. */
const RANK_STEPS = [
  { bg: "#0d1b8c", text: "#ffffff" },
  { bg: "#3b46d1", text: "#ffffff" },
  { bg: "#8a91ea", text: "#0b0b0b" },
  { bg: "#c5c8f5", text: "#0b0b0b" },
  { bg: "#e5e5e5", text: "#0b0b0b" },
];

/**
 * "Match per course (%)" list: one shaded bar per course in rank order, the
 * shade stepping from navy to gray. Each bar links to that course's comparison.
 */
export function CourseMatchList({
  ranking,
  selectedId,
  preferredId,
  hrefs,
}: Readonly<{
  ranking: { program_id: number; program_code: string; program_name: string; match: number; rank: number }[];
  selectedId?: number;
  preferredId?: number;
  /** program_id → link to compare that course. */
  hrefs: Record<number, string>;
}>) {
  if (ranking.length === 0) {
    return <p className="text-sm text-neutral-600">No recommendations generated yet.</p>;
  }

  const last = Math.max(1, ranking.length - 1);
  return (
    <ol className="space-y-2">
      {ranking.map((course, index) => {
        const step = RANK_STEPS[Math.round((index / last) * (RANK_STEPS.length - 1))];
        const selected = course.program_id === selectedId;
        return (
          <li key={course.program_id}>
            <PendingLink
              href={hrefs[course.program_id]}
              aria-current={selected ? "true" : undefined}
              title={`${course.rank}. ${course.program_name}: ${course.match}% match`}
              className={`flex items-center justify-between gap-2 rounded-md border border-black/15 px-3 py-1.5 text-sm transition-[filter] hover:brightness-110 ${
                selected ? "ring-2 ring-[#191e73] ring-offset-2" : ""
              }`}
              style={{ backgroundColor: step.bg, color: step.text }}
            >
              <span className="truncate">
                <span className="font-semibold">{course.program_code}</span>
                <span aria-hidden="true"> · </span>
                <span className="tabular-nums">{course.match}%</span>
              </span>
              {course.program_id === preferredId && (
                <span className="shrink-0 rounded-full border border-current px-1.5 text-[10px]">preferred</span>
              )}
            </PendingLink>
          </li>
        );
      })}
    </ol>
  );
}

/** Ranked match per course; the selected course is emphasized, others gray. */
export function MatchPerCourse({
  ranking,
  selectedId,
  preferredId,
  hrefFor,
}: Readonly<{
  ranking: { program_id: number; program_code: string; program_name: string; match: number; rank: number }[];
  selectedId?: number;
  preferredId?: number;
  hrefFor?: (programId: number) => string;
}>) {
  if (ranking.length === 0) {
    return <p className="text-sm text-neutral-600">No recommendations generated yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {ranking.map((course) => {
        const selected = course.program_id === selectedId;
        const content = (
          <>
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className={selected ? "font-semibold" : ""}>
                {course.rank}. {course.program_code}
                {course.program_id === preferredId && (
                  <span className="ml-1.5 rounded-full border border-neutral-500 px-1.5 text-[10px] font-normal">
                    preferred
                  </span>
                )}
              </span>
              <span className="tabular-nums">{course.match}%</span>
            </span>
            <span className="mt-1 block h-2.5 rounded-r-[4px] bg-neutral-100">
              <span
                className="chart-bar block h-full rounded-r-[4px]"
                style={{ width: `${course.match}%`, backgroundColor: selected ? APPLICANT : "#a3a3a3" }}
              />
            </span>
          </>
        );

        return (
          <li key={course.program_id} title={`${course.program_name}: ${course.match}% match`}>
            {hrefFor ? (
              <Link
                href={hrefFor(course.program_id)}
                aria-current={selected ? "true" : undefined}
                className={`block rounded-lg px-2 py-1.5 transition-colors ${
                  selected ? "bg-[#e3e4f8]" : "hover:bg-neutral-100"
                }`}
              >
                {content}
              </Link>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
