import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import MapExplorer from "@/components/map/map-explorer";
import { ParamSelect } from "@/components/recommendation/controls";
import {
  describeFilters,
  filterQuery,
  getMapOverview,
  resolveMapFilters,
  STATUS_OPTIONS,
} from "@/features/map/queries";
import { requirePermission } from "@/lib/authorization";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string; program?: string; status?: string }>;
}>;

const cell = "border border-neutral-500 px-3 py-2";

async function MapContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("map", "read");

  const filters = await resolveMapFilters(await searchParams);

  if (!filters.cycle) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Map</h1>
        <p className="mt-2 text-sm text-neutral-600">No admission cycle exists yet.</p>
      </div>
    );
  }

  const overview = await getMapOverview(filters);
  const filterLines = describeFilters(filters);

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />

      <div>
        <h1 className="text-2xl font-bold">Map</h1>
        <p className="text-sm text-neutral-700">
          Where applicants come from. Darker areas have more applicants.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <ParamSelect
          param="cycle"
          label="School year"
          value={String(filters.cycle.cycle_id)}
          options={filters.cycles.map((c) => ({
            value: String(c.cycle_id),
            label: `${c.school_year}${c.is_active ? " (active)" : ""}`,
          }))}
        />
        <ParamSelect
          param="program"
          label="Course"
          value={filters.program ? String(filters.program.program_id) : ""}
          options={[
            { value: "", label: "All" },
            ...filters.programs.map((p) => ({ value: String(p.program_id), label: p.program_code })),
          ]}
        />
        <ParamSelect param="status" label="Status" value={filters.status} options={STATUS_OPTIONS} />
      </div>

      <MapExplorer
        overview={overview}
        filterQueryString={filterQuery(filters)}
        filterLines={filterLines}
      />

      {overview.unknownLocation > 0 && (
        <p className="text-xs text-neutral-600">
          {overview.unknownLocation} applicant{overview.unknownLocation === 1 ? " has" : "s have"} no barangay on record and
          {overview.unknownLocation === 1 ? " is" : " are"} not shown on the map.
        </p>
      )}

      {/* District counts — also the accessible table view of the map */}
      <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
        <h2 className="mb-3 font-semibold">District counts</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 text-left">
                {["District", "Barangays", "Applicants", "Passed", "Share"].map((h) => (
                  <th key={h} className={`${cell} font-medium`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.districts.map((d) => (
                <tr key={d.id}>
                  <td className={cell}>{d.name}</td>
                  <td className={`${cell} tabular-nums`}>{d.barangays.length}</td>
                  <td className={`${cell} tabular-nums`}>{d.applicants}</td>
                  <td className={`${cell} tabular-nums`}>{d.admitted}</td>
                  <td className={`${cell} tabular-nums`}>
                    {overview.total > 0 ? `${Math.round((d.applicants / overview.total) * 1000) / 10}%` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
        <h2 className="font-semibold">Outside Quezon City</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Applicants whose previous school is outside Quezon City, by the school&apos;s city or municipality.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 text-left">
                {["City / Municipality", "Applicants", "Passed"].map((h) => (
                  <th key={h} className={`${cell} font-medium`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.outside.length > 0 ? (
                overview.outside.map((row) => (
                  <tr key={row.city}>
                    <td className={cell}>{row.city}</td>
                    <td className={`${cell} tabular-nums`}>{row.applicants}</td>
                    <td className={`${cell} tabular-nums`}>{row.admitted}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className={`${cell} py-6 text-center text-neutral-600`}>
                    No applicants from schools outside Quezon City for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function MapPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <MapContent searchParams={searchParams} />
    </Suspense>
  );
}
