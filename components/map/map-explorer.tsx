"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import type { MapOverview } from "@/features/map/queries";
import { heatBins, mapLevelValues, ZERO_FILL, type HeatBin, type MapLevel } from "@/features/map/geo";
import { ExportDialog } from "@/components/map/export-dialog";

// Leaflet needs `window`, so the map is rendered in the browser only.
const LeafletMap = dynamic(() => import("@/components/map/leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-600">Loading map…</div>
  ),
});

type Selection = { level: MapLevel; id: number } | null;

const MAP_HEIGHT = "min(60vh, 32rem)";

function Legend({ bins }: Readonly<{ bins: HeatBin[] }>) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Legend (applicants)</p>
      <ul className="space-y-1 text-sm">
        {[...bins].reverse().map((bin) => (
          <li key={bin.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: bin.color }} />
            {bin.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: ZERO_FILL }} />
          None
        </li>
      </ul>
    </div>
  );
}

function TopList({ title, items }: Readonly<{ title: string; items: { name: string; count: number }[] }>) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-neutral-700">{title}</p>
      <ol className="mt-0.5 space-y-0.5 text-xs">
        {items.map((item) => (
          <li key={item.name} className="flex justify-between gap-2">
            <span className="truncate">{item.name}</span>
            <span className="tabular-nums text-neutral-600">{item.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function MapExplorer({
  overview,
  filterQueryString,
  filterLines,
}: Readonly<{
  overview: MapOverview;
  filterQueryString: string;
  filterLines: string[];
}>) {
  const [level, setLevel] = useState<MapLevel>("district");
  const [selected, setSelected] = useState<Selection>(null);

  const barangays = overview.districts.flatMap((d) =>
    d.barangays.map((b) => ({ ...b, districtId: d.id, districtName: d.name })),
  );
  const bins = heatBins(Math.max(0, ...mapLevelValues(overview.districts, level)));

  const selectedBarangay = selected?.level === "barangay" ? barangays.find((b) => b.id === selected.id) : undefined;
  const selectedDistrict =
    selected?.level === "district"
      ? overview.districts.find((d) => d.id === selected.id)
      : overview.districts.find((d) => d.id === selectedBarangay?.districtId);

  const focus = selectedBarangay ?? selectedDistrict;
  const focusApplicants = focus ? focus.applicants : overview.total;
  const focusAdmitted = focus ? focus.admitted : overview.districts.reduce((s, d) => s + d.admitted, 0);
  const share = overview.total > 0 ? Math.round((focusApplicants / overview.total) * 1000) / 10 : 0;

  let title = "Quezon City overview";
  let caption = "applicants in Quezon City";
  if (selectedBarangay) {
    title = `Brgy. ${selectedBarangay.name}`;
    caption = `applicants · ${selectedBarangay.districtName}`;
  } else if (selectedDistrict) {
    title = `${selectedDistrict.name} overview`;
    caption = "applicants in selected district";
  }

  const listQuery = new URLSearchParams(filterQueryString);
  if (selectedBarangay) listQuery.set("barangay", String(selectedBarangay.id));
  else if (selectedDistrict) listQuery.set("district", String(selectedDistrict.id));

  function select(next: Selection) {
    setSelected((current) => (current && next && current.level === next.level && current.id === next.id ? null : next));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Map level" className="inline-flex rounded-full border border-neutral-500 bg-white p-1">
            {(["district", "barangay"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={level === value}
                onClick={() => {
                  setLevel(value);
                  setSelected(null);
                }}
                className={`rounded-full px-4 py-1 text-sm ${
                  level === value ? "bg-[#191e73] font-semibold text-white" : "hover:bg-neutral-100"
                }`}
              >
                {value === "district" ? "Districts" : "Barangays"}
              </button>
            ))}
          </div>

          {/* Keyboard-friendly way to pick an area (map shapes are mouse/touch only). */}
          <label className="flex items-center gap-2 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm">
            <span className="text-neutral-700">Area:</span>
            <select
              value={selected ? `${selected.level}:${selected.id}` : ""}
              onChange={(event) => {
                const [lvl, id] = event.target.value.split(":");
                setSelected(event.target.value ? { level: lvl as MapLevel, id: Number(id) } : null);
              }}
              className="max-w-56 bg-transparent font-medium outline-none"
            >
              <option value="">All of Quezon City</option>
              {level === "district"
                ? overview.districts.map((d) => (
                    <option key={d.id} value={`district:${d.id}`}>
                      {d.name} ({d.applicants})
                    </option>
                  ))
                : overview.districts.map((d) => (
                    <optgroup key={d.id} label={d.name}>
                      {d.barangays.map((b) => (
                        <option key={b.id} value={`barangay:${b.id}`}>
                          {b.name} ({b.applicants})
                        </option>
                      ))}
                    </optgroup>
                  ))}
            </select>
          </label>
        </div>

        <ExportDialog
          districts={overview.districts}
          cityOutline={overview.cityOutline}
          level={level}
          bins={bins}
          filterLines={filterLines}
          filterQueryString={filterQueryString}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <figure className="rounded-xl border border-neutral-500 bg-neutral-100/90 p-2">
          <div style={{ height: MAP_HEIGHT }}>
            {overview.hasGeometry && overview.bounds ? (
              <LeafletMap
                districts={overview.districts}
                cityOutline={overview.cityOutline}
                bounds={overview.bounds}
                level={level}
                bins={bins}
                selected={selected}
                onSelect={select}
                height={MAP_HEIGHT}
              />
            ) : (
              <p className="p-10 text-center text-sm text-neutral-600">
                Map boundaries are not loaded. Run <code>npm run db:seed</code>.
              </p>
            )}
          </div>
          <figcaption className="mt-1 px-1 text-xs text-neutral-600">
            Click a {level} (or use the Area list) to see its summary. Use + / − to zoom.
          </figcaption>
        </figure>

        <aside className="grid content-start gap-4 rounded-xl border border-neutral-500 bg-white/90 p-4 sm:grid-cols-2" aria-live="polite">
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-3xl font-bold tabular-nums">{focusApplicants}</p>
            <p className="text-xs text-neutral-600">{caption}</p>
            <p className="mt-1 text-xs text-neutral-700">{focusAdmitted} passed (admitted)</p>
          </div>

          <div>
            <p className="text-sm font-medium">Applicant concentration</p>
            <div
              className="mt-1.5 h-3 rounded-full bg-neutral-200"
              role="meter"
              aria-label="Share of all applicants"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={share}
            >
              <div className="h-full rounded-full bg-[#1c5cab]" style={{ width: `${share}%` }} />
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              {focus ? `${share}% of all applicants` : "Select an area to compare its share."}
            </p>
          </div>

          {!selectedBarangay && (
            <div className="space-y-2">
              <TopList title="Top previous schools" items={selectedDistrict?.topSchools ?? overview.topSchools} />
              <TopList title="Top preferred courses" items={selectedDistrict?.topCourses ?? overview.topCourses} />
            </div>
          )}

          <div className="space-y-2">
            <Link
              href={`/map/applicants?${listQuery.toString()}`}
              className="block rounded-md bg-neutral-700 px-3 py-2 text-center text-sm font-medium text-white hover:bg-neutral-800"
            >
              View applicant list
            </Link>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-full text-xs text-neutral-600 underline hover:text-neutral-900"
              >
                Clear selection
              </button>
            )}
          </div>

          <Legend bins={bins} />
        </aside>
      </div>
    </div>
  );
}
