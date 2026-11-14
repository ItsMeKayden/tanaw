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
        {rows.map((row) => (
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
                      className="h-full rounded-r-[4px]"
                      style={{ width: `${Math.min(100, value ?? 0)}%`, backgroundColor: color }}
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

/**
 * How a course match is built: each competency can contribute up to its
 * weight (track); the fill is what the applicant earned (score × weight).
 */
export function MatchContributionChart({
  rows,
  total,
  courseLabel,
}: Readonly<{
  rows: { label: string; weight: number; contribution: number; score: number | null }[];
  total: number | null;
  courseLabel: string;
}>) {
  const maxWeight = Math.max(1, ...rows.map((r) => r.weight));

  return (
    <figure className="space-y-4">
      <Legend
        items={[
          { label: "Points earned by applicant", color: APPLICANT },
          { label: `Course weight (max points) – ${courseLabel}`, color: "#d4d4d4" },
        ]}
      />
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            title={`${row.label}: ${row.contribution} of ${row.weight} points (applicant scored ${row.score ?? 0}%)`}
            className="grid grid-cols-[6.5rem_1fr_6.5rem] items-center gap-3"
          >
            <span className="text-sm text-neutral-800">{row.label}</span>
            <div className="h-4 rounded-r-[4px]">
              <div
                className="relative h-full rounded-r-[4px] bg-neutral-300"
                style={{ width: `${(row.weight / maxWeight) * 100}%`, minWidth: row.weight > 0 ? 2 : 0 }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{
                    width: row.weight > 0 ? `${(row.contribution / row.weight) * 100}%` : 0,
                    backgroundColor: APPLICANT,
                  }}
                />
              </div>
            </div>
            <span className="text-right text-xs text-neutral-800 tabular-nums">
              {row.contribution} / {row.weight} pts
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-neutral-300 pt-2 text-sm">
        <span className="text-neutral-800">Total match</span>
        <span className="text-lg font-semibold tabular-nums">{total === null ? "--" : `${total}%`}</span>
      </div>
    </figure>
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
                className="block h-full rounded-r-[4px]"
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
