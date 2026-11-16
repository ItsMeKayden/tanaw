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

/*
 * Profile radar colors (one blue ramp, validated for CVD and normal-vision
 * separation): applicant fill #86aef5 / edge #4a7be0, requirement #2f3fb0.
 * "Below requirement" uses the status red, always with a label too.
 */
const RADAR_APPLICANT_FILL = "#86aef5";
const RADAR_APPLICANT_EDGE = "#4a7be0";
const RADAR_REQUIRED = "#2f3fb0";
const RADAR_BELOW = "#dc2626";

export type RadarRow = { label: string; score: number | null; required: number | null };

/**
 * Applicant score vs the course's required score per competency (0–100%),
 * one spoke per competency. A spoke whose score is under its requirement gets
 * a red point and a red "score / required" label.
 */
export function ProfileRadar({ rows, courseLabel }: Readonly<{ rows: RadarRow[]; courseLabel: string }>) {
  if (rows.length < 3) {
    return <p className="py-10 text-center text-sm text-neutral-600">At least three competencies are needed for this chart.</p>;
  }

  const size = 340;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = 112;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / rows.length;
  const point = (i: number, value: number) => {
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))] as const;
  };
  const polygon = (values: number[]) => values.map((v, i) => point(i, v).join(",")).join(" ");

  const below = (row: RadarRow) => row.required !== null && (row.score ?? 0) < row.required;
  const rings = [25, 50, 75, 100];

  return (
    <figure className="space-y-3">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-sm"
        role="img"
        aria-label={`Applicant scores compared with ${courseLabel} requirements: ${rows
          .map((r) => `${r.label} ${r.score ?? 0} of ${r.required ?? "no requirement"}`)
          .join(", ")}`}
      >
        {/* Recessive grid: rings every 25% and one spoke per competency */}
        {rings.map((ring) => (
          <polygon key={ring} points={polygon(rows.map(() => ring))} fill="none" stroke="#e5e5e5" strokeWidth={1} />
        ))}
        {rows.map((row, i) => {
          const [x, y] = point(i, 100);
          return <line key={row.label} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e5e5" strokeWidth={1} />;
        })}

        {/* Applicant (filled) under the requirement outline (dashed) */}
        <polygon
          points={polygon(rows.map((r) => r.score ?? 0))}
          fill={RADAR_APPLICANT_FILL}
          fillOpacity={0.45}
          stroke={RADAR_APPLICANT_EDGE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <polygon
          points={polygon(rows.map((r) => r.required ?? 0))}
          fill="none"
          stroke={RADAR_REQUIRED}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />

        {/* Points (>= 8px with a white ring) and labels */}
        {rows.map((row, i) => {
          const [px, py] = point(i, row.score ?? 0);
          const [lx, ly] = point(i, 122);
          const cos = Math.cos(angle(i));
          const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
          const dy = Math.sin(angle(i)) < -0.5 ? -14 : Math.sin(angle(i)) > 0.5 ? 6 : -4;
          const isBelow = below(row);
          return (
            <g key={row.label}>
              <circle cx={px} cy={py} r={4.5} fill={isBelow ? RADAR_BELOW : RADAR_APPLICANT_EDGE} stroke="#ffffff" strokeWidth={2}>
                <title>
                  {`${row.label}: applicant ${row.score ?? 0}%, required ${row.required === null ? "none" : `${row.required}%`}${isBelow ? " (below requirement)" : ""}`}
                </title>
              </circle>
              <text x={lx} y={ly + dy} textAnchor={anchor} className="fill-neutral-900 text-[11px] font-medium">
                {row.label}
              </text>
              <text
                x={lx}
                y={ly + dy + 13}
                textAnchor={anchor}
                className={`text-[10px] font-semibold tabular-nums ${isBelow ? "fill-red-700" : "fill-[#2f3fb0]"}`}
              >
                {row.score ?? 0} / {row.required ?? "—"}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-neutral-800" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-[3px] border-2" style={{ backgroundColor: `${RADAR_APPLICANT_FILL}aa`, borderColor: RADAR_APPLICANT_EDGE }} />
          Applicant
        </li>
        <li className="flex items-center gap-1.5">
          <svg aria-hidden="true" width="18" height="6">
            <line x1="0" y1="3" x2="18" y2="3" stroke={RADAR_REQUIRED} strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          Required ({courseLabel})
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: RADAR_BELOW }} />
          Below requirement
        </li>
      </ul>

      <details className="text-xs text-neutral-700">
        <summary className="cursor-pointer select-none hover:text-black">Show as table</summary>
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr>
              {["Competency", "Applicant", "Required", "Result"].map((h) => (
                <th key={h} className="border border-neutral-300 px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="border border-neutral-300 px-2 py-1">{row.label}</td>
                <td className="border border-neutral-300 px-2 py-1 tabular-nums">{row.score ?? 0}%</td>
                <td className="border border-neutral-300 px-2 py-1 tabular-nums">{row.required === null ? "—" : `${row.required}%`}</td>
                <td className="border border-neutral-300 px-2 py-1">
                  {row.required === null ? "Not required" : below(row) ? "Below" : "Meets"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
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
            <Link
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
            </Link>
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
