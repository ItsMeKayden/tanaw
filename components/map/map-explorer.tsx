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

const MAP_HEIGHT = "clamp(26rem, 68vh, 44rem)";

/** Compact legend that floats over the map's bottom-left corner. */
function Legend({ bins }: Readonly<{ bins: HeatBin[] }>) {
  return (
    <div className="pointer-events-auto rounded-lg border border-neutral-300 bg-white/95 px-2.5 py-2 shadow-sm">
      <p className="mb-1 text-[11px] font-semibold text-neutral-800">Applicants</p>
      <ul className="space-y-0.5 text-[11px] text-neutral-800">
        {[...bins].reverse().map((bin) => (
          <li key={bin.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: bin.color }} />
            <span className="tabular-nums">{bin.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: ZERO_FILL }} />
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
      <p className="mb-1 text-xs font-semibold text-neutral-700">{title}</p>
      <ol className="space-y-1 text-xs">
        {items.map((item, index) => (
          <li key={item.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="w-3 shrink-0 text-right text-neutral-400 tabular-nums">{index + 1}</span>
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-medium tabular-nums text-neutral-700">{item.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const card = "rounded-xl border border-neutral-300 bg-white/95 p-3 shadow-sm";

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
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Map with its own controls bar and a floating legend */}
      <figure className={`${card} space-y-2 p-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Map level" className="inline-flex rounded-full border border-neutral-400 bg-neutral-100 p-0.5">
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
                  className={`rounded-full px-3.5 py-1 text-sm transition-colors ${
                    level === value ? "bg-[#191e73] font-semibold text-white shadow-sm" : "text-neutral-700 hover:bg-white"
                  }`}
                >
                  {value === "district" ? "Districts" : "Barangays"}
                </button>
              ))}
            </div>

            {/* Keyboard-friendly way to pick an area (map shapes are mouse/touch only). */}
            <label className="flex items-center gap-2 rounded-lg border border-neutral-400 bg-white px-2.5 py-1 text-sm">
              <span className="text-neutral-600">Area</span>
              <select
                value={selected ? `${selected.level}:${selected.id}` : ""}
                onChange={(event) => {
                  const [lvl, id] = event.target.value.split(":");
                  setSelected(event.target.value ? { level: lvl as MapLevel, id: Number(id) } : null);
                }}
                className="max-w-52 bg-transparent font-medium outline-none"
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

        <div className="relative" style={{ height: MAP_HEIGHT }}>
          {overview.hasGeometry && overview.bounds ? (
            <>
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
              {/* Above Leaflet's panes (z 400), below its zoom controls (z 800+). */}
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
                <Legend bins={bins} />
              </div>
            </>
          ) : (
            <p className="p-10 text-center text-sm text-neutral-600">
              Map boundaries are not loaded. Run <code>npm run db:seed</code>.
            </p>
          )}
        </div>
        <figcaption className="px-1 pb-0.5 text-xs text-neutral-600">
          Click a {level} (or use the Area list) to see its numbers. Use + / − to zoom.
        </figcaption>
      </figure>

      {/* Side panel: selected area, top lists, actions */}
      <aside className="grid content-start gap-3 sm:grid-cols-2 xl:flex xl:flex-col" aria-live="polite">
        <section className={card}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-[#191e73]">{title}</p>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-md px-1.5 text-xs text-neutral-600 underline-offset-2 hover:text-black hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums">{focusApplicants.toLocaleString("en-US")}</p>
          <p className="text-xs text-neutral-600">{caption}</p>
          <p className="mt-1 text-xs text-neutral-700">
            <span className="font-medium tabular-nums">{focusAdmitted.toLocaleString("en-US")}</span> passed (admitted)
          </p>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neutral-700">Share of all applicants</span>
              <span className="tabular-nums text-neutral-700">{focus ? `${share}%` : "100%"}</span>
            </div>
            <div
              className="mt-1 h-2 rounded-full bg-neutral-200"
              role="meter"
              aria-label="Share of all applicants"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={focus ? share : 100}
            >
              <div className="h-full rounded-full bg-[#1c5cab]" style={{ width: `${focus ? share : 100}%` }} />
            </div>
            {!focus && <p className="mt-1 text-[11px] text-neutral-500">Select an area to compare its share.</p>}
          </div>

          <Link
            href={`/map/applicants?${listQuery.toString()}`}
            className="mt-3 block rounded-md bg-[#191e73] px-3 py-2 text-center text-sm font-semibold text-white hover:bg-[#232a99]"
          >
            View applicant list
          </Link>
        </section>

        <section className={`${card} space-y-3 xl:flex-1`}>
          <p className="text-xs text-neutral-500">
            {selectedDistrict ? `In ${selectedDistrict.name}` : "All of Quezon City"}
          </p>
          <TopList title="Top previous schools" items={selectedDistrict?.topSchools ?? overview.topSchools} />
          <TopList title="Top preferred courses" items={selectedDistrict?.topCourses ?? overview.topCourses} />
          {(selectedDistrict?.topSchools ?? overview.topSchools).length === 0 &&
            (selectedDistrict?.topCourses ?? overview.topCourses).length === 0 && (
              <p className="text-xs text-neutral-600">No applicants for these filters.</p>
            )}
        </section>
      </aside>
    </div>
  );
}
