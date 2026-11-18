"use client";

import { useEffect, useRef, useState } from "react";

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
  // Animated copies of the values: grow from the center on first show, then
  // morph smoothly when the applicant or course changes.
  const scores = useTweenedValues(rows.map((r) => r.score ?? 0));
  const required = useTweenedValues(rows.map((r) => r.required ?? 0));

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
          points={polygon(scores)}
          fill={RADAR_APPLICANT_FILL}
          fillOpacity={0.45}
          stroke={RADAR_APPLICANT_EDGE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <polygon
          points={polygon(required)}
          fill="none"
          stroke={RADAR_REQUIRED}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />

        {/* Points (>= 8px with a white ring) and labels */}
        {rows.map((row, i) => {
          const [px, py] = point(i, scores[i] ?? 0);
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


const TWEEN_MS = 650;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Returns values that animate from their previous numbers (zeros at first)
 * to `target` over TWEEN_MS. Jumps straight there when the user prefers
 * reduced motion.
 */
function useTweenedValues(target: number[]) {
  const key = target.join(",");
  const [shown, setShown] = useState(() => target.map(() => 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    const goal = key.split(",").map(Number);
    const from = goal.map((_, i) => shownRef.current[i] ?? 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - startedAt) / TWEEN_MS);
      const eased = easeOutCubic(t);
      const next = goal.map((g, i) => from[i] + (g - from[i]) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return shown;
}
