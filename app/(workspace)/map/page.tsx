import { Suspense } from "react";
import { connection } from "next/server";

import { tableStyles } from "@/components/ui/table-styles";
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
import { MapSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string; program?: string; status?: string }>;
}>;

const cell = tableStyles.td;
const headCell = tableStyles.th;

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
    <div className="relative isolate min-h-full space-y-3 p-3 sm:p-4">
      <QcuWatermark />

      {/* Title and data filters share one row; map controls sit with the map. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Applicant map</h1>
          <p className="text-sm text-neutral-700">
            Where applicants come from. Darker areas have more applicants.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
        <ParamSelect
          param="cycle"
          label="School year"
          compact
          value={String(filters.cycle.cycle_id)}
          options={filters.cycles.map((c) => ({
            value: String(c.cycle_id),
            label: `${c.school_year}${c.is_active ? " (active)" : ""}`,
          }))}
        />
        <ParamSelect
          param="program"
          label="Course"
          compact
          value={filters.program ? String(filters.program.program_id) : ""}
          options={[
            { value: "", label: "All" },
            ...filters.programs.map((p) => ({ value: String(p.program_id), label: p.program_code })),
          ]}
        />
        <ParamSelect param="status" label="Status" value={filters.status} options={STATUS_OPTIONS} compact />
        </div>
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

      <div className="grid gap-3 lg:grid-cols-2">
      {/* District counts — also the accessible table view of the map */}
      <section className="flex flex-col rounded-xl border border-neutral-300 bg-white/95 p-3 shadow-sm">
        <h2 className="font-semibold">District counts</h2>
        <p className="mb-2 text-xs text-neutral-600">Applicants per Quezon City district for these filters.</p>
        <div className={tableStyles.wrap}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={tableStyles.headRow}>
                {["District", "Barangays", "Applicants", "Passed", "Share"].map((h) => (
                  <th key={h} className={headCell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {overview.districts.map((d) => (
                <tr key={d.id} className={tableStyles.row}>
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

      <section className="flex flex-col rounded-xl border border-neutral-300 bg-white/95 p-3 shadow-sm">
        <h2 className="font-semibold">Outside Quezon City</h2>
        <p className="mb-2 text-xs text-neutral-600">
          Applicants whose previous school is outside Quezon City, by the school&apos;s city or municipality.
        </p>
        <div className={`${tableStyles.wrap} max-h-96 overflow-y-auto`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={tableStyles.headRow}>
                {["City / Municipality", "Applicants", "Passed"].map((h) => (
                  <th key={h} className={headCell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {overview.outside.length > 0 ? (
                overview.outside.map((row) => (
                  <tr key={row.city} className={tableStyles.row}>
                    <td className={cell}>{row.city}</td>
                    <td className={`${cell} tabular-nums`}>{row.applicants}</td>
                    <td className={`${cell} tabular-nums`}>{row.admitted}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className={tableStyles.empty}>
                    No applicants from schools outside Quezon City for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  );
}

export default function MapPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapContent searchParams={searchParams} />
    </Suspense>
  );
}
