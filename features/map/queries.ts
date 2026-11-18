// Server-side data for the Map module (imports Prisma).
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { resolveCycle } from "@/features/admission/admission-stats";
import { formatFullName } from "@/features/admission/enrollment-queries";
import { ADMISSION_STAGE_ORDER, ADMITTED_STAGES } from "@/features/admission/stages";
import {
  boundsOf,
  groupLabelPoint,
  labelPoint,
  outlineSegments,
  parseBoundary,
  type LonLat,
  type PolygonCoords,
  type Segment,
} from "@/features/map/geo";

// 6 decimals ≈ 10 cm: plenty for a city map, about half the payload.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const roundPoint = ([lon, lat]: [number, number]): LonLat => [round6(lon), round6(lat)];
const roundSegments = (segments: Segment[]): Segment[] => segments.map(([a, b]) => [roundPoint(a), roundPoint(b)]);
const roundPolygons = (polygons: PolygonCoords[]): PolygonCoords[] =>
  polygons.map((polygon) => polygon.map((ring) => ring.map(roundPoint)));
const HOME_CITY = "quezon city";

type RawParams = { cycle?: string | string[]; program?: string | string[]; status?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ADMITTED", label: "Passed (admitted)" },
  ...ADMISSION_STAGE_ORDER.map((stage) => ({ value: stage, label: stage })),
];

/** Resolves the shared School year / Course / Status filters from the URL. */
export async function resolveMapFilters(params: RawParams) {
  const { cycles, cycle } = await resolveCycle(first(params.cycle));
  const programs = await prisma.tbl_program.findMany({
    orderBy: { program_code: "asc" },
    select: { program_id: true, program_code: true, program_name: true },
  });

  const programId = Number(first(params.program));
  const program = programs.find((p) => p.program_id === programId) ?? null;
  const statusParam = first(params.status) ?? "ALL";
  const status = STATUS_OPTIONS.some((o) => o.value === statusParam) ? statusParam : "ALL";

  return { cycles, cycle, programs, program, status };
}

export type MapFilters = Awaited<ReturnType<typeof resolveMapFilters>>;

export function applicationWhere(filters: MapFilters): Prisma.tbl_applicationWhereInput {
  const where: Prisma.tbl_applicationWhereInput = { ...ACTIVE_APPLICATION, cycle_id: filters.cycle?.cycle_id ?? -1 };
  if (filters.program) where.program_id = filters.program.program_id;
  if (filters.status === "ADMITTED") {
    where.tbl_admission_stage = { stage_name: { in: [...ADMITTED_STAGES] } };
  } else if (filters.status !== "ALL") {
    where.tbl_admission_stage = { stage_name: filters.status };
  }
  return where;
}

/** Filter values as query-string pairs (for links and exports). */
export function filterQuery(filters: MapFilters, extra: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  if (filters.cycle) query.set("cycle", String(filters.cycle.cycle_id));
  if (filters.program) query.set("program", String(filters.program.program_id));
  if (filters.status !== "ALL") query.set("status", filters.status);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export function describeFilters(filters: MapFilters) {
  return [
    `School year: ${filters.cycle?.school_year ?? "—"}`,
    `Course: ${filters.program ? filters.program.program_code : "All"}`,
    `Status: ${STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? "All"}`,
  ];
}

type Tally = { applicants: number; admitted: number };
const emptyTally = (): Tally => ({ applicants: 0, admitted: 0 });

function topEntries(counts: Map<string, number>, limit = 3) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/** Everything the map overview needs: geometry, counts, and the outside-QC table. */
export async function getMapOverview(filters: MapFilters) {
  const where = applicationWhere(filters);

  const [groups, districts, schools, programs, stages] = await Promise.all([
    prisma.tbl_application.groupBy({
      by: ["barangay_id", "school_id", "program_id", "current_stage_id"],
      where,
      _count: { _all: true },
    }),
    prisma.tbl_district.findMany({
      orderBy: { district_name: "asc" },
      select: {
        district_id: true,
        district_name: true,
        tbl_barangay: {
          orderBy: { barangay_name: "asc" },
          select: { barangay_id: true, barangay_name: true, boundary_geojson: true },
        },
      },
    }),
    prisma.tbl_school.findMany({ select: { school_id: true, school_name: true, city_municipality: true } }),
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true } }),
    prisma.tbl_admission_stage.findMany({ select: { stage_id: true, stage_name: true } }),
  ]);

  const stageName = new Map(stages.map((s) => [s.stage_id, s.stage_name]));
  const schoolById = new Map(schools.map((s) => [s.school_id, s]));
  const programCode = new Map(programs.map((p) => [p.program_id, p.program_code]));

  const byBarangay = new Map<number, Tally>();
  const schoolsByDistrict = new Map<number, Map<string, number>>();
  const coursesByDistrict = new Map<number, Map<string, number>>();
  const outside = new Map<string, Tally>();
  const districtOf = new Map<number, number>();
  for (const district of districts) {
    for (const b of district.tbl_barangay) districtOf.set(b.barangay_id, district.district_id);
  }

  let total = 0;
  let unknownLocation = 0;

  for (const group of groups) {
    const count = group._count._all;
    const admitted = ADMITTED_STAGES.includes(stageName.get(group.current_stage_id ?? -1) ?? "");
    total += count;

    const school = group.school_id ? schoolById.get(group.school_id) : undefined;
    const city = school?.city_municipality?.trim();
    if (city && city.toLowerCase() !== HOME_CITY) {
      const tally = outside.get(city) ?? emptyTally();
      tally.applicants += count;
      if (admitted) tally.admitted += count;
      outside.set(city, tally);
    }

    if (group.barangay_id === null) {
      unknownLocation += count;
      continue;
    }
    const tally = byBarangay.get(group.barangay_id) ?? emptyTally();
    tally.applicants += count;
    if (admitted) tally.admitted += count;
    byBarangay.set(group.barangay_id, tally);

    const districtId = districtOf.get(group.barangay_id);
    if (districtId !== undefined) {
      if (school) {
        const m = schoolsByDistrict.get(districtId) ?? new Map<string, number>();
        m.set(school.school_name, (m.get(school.school_name) ?? 0) + count);
        schoolsByDistrict.set(districtId, m);
      }
      const code = group.program_id ? programCode.get(group.program_id) : undefined;
      if (code) {
        const m = coursesByDistrict.get(districtId) ?? new Map<string, number>();
        m.set(code, (m.get(code) ?? 0) + count);
        coursesByDistrict.set(districtId, m);
      }
    }
  }

  // ----- geometry (GeoJSON longitude/latitude for Leaflet and exports) -----
  const parsed = districts.map((district) => ({
    district,
    barangays: district.tbl_barangay.map((b) => ({ ...b, polygons: parseBoundary(b.boundary_geojson) })),
  }));
  const allPolygons: PolygonCoords[] = parsed.flatMap((d) => d.barangays.flatMap((b) => b.polygons));
  const hasGeometry = allPolygons.length > 0;

  const cityTop = (maps: Map<number, Map<string, number>>) => {
    const merged = new Map<string, number>();
    for (const m of maps.values()) for (const [k, v] of m) merged.set(k, (merged.get(k) ?? 0) + v);
    return topEntries(merged);
  };

  const districtData = parsed.map(({ district, barangays }) => {
    const polygons = barangays.flatMap((b) => b.polygons);
    const tally = barangays.reduce((sum, b) => {
      const t = byBarangay.get(b.barangay_id);
      return t ? { applicants: sum.applicants + t.applicants, admitted: sum.admitted + t.admitted } : sum;
    }, emptyTally());

    return {
      id: district.district_id,
      name: district.district_name,
      ...tally,
      outline: roundSegments(outlineSegments(polygons)),
      label: roundPoint(groupLabelPoint(barangays.map((b) => b.polygons))),
      topSchools: topEntries(schoolsByDistrict.get(district.district_id) ?? new Map()),
      topCourses: topEntries(coursesByDistrict.get(district.district_id) ?? new Map()),
      barangays: barangays.map((b) => ({
        id: b.barangay_id,
        name: b.barangay_name,
        ...(byBarangay.get(b.barangay_id) ?? emptyTally()),
        polygons: roundPolygons(b.polygons),
        label: roundPoint(labelPoint(b.polygons)),
      })),
    };
  });

  const box = hasGeometry ? boundsOf(allPolygons) : null;

  return {
    hasGeometry,
    /** [[south, west], [north, east]] for Leaflet. */
    bounds: box ? ([[box.minLat, box.minLon], [box.maxLat, box.maxLon]] as [[number, number], [number, number]]) : null,
    cityOutline: hasGeometry ? roundSegments(outlineSegments(allPolygons)) : [],
    total,
    unknownLocation,
    districts: districtData,
    topSchools: cityTop(schoolsByDistrict),
    topCourses: cityTop(coursesByDistrict),
    outside: [...outside.entries()]
      .map(([city, t]) => ({ city, ...t }))
      .sort((a, b) => b.applicants - a.applicants || a.city.localeCompare(b.city)),
  };
}

export type MapOverview = Awaited<ReturnType<typeof getMapOverview>>;

export const APPLICANTS_PAGE_SIZE = 20;

/** Applicants in a district or barangay (or all of QC), paginated. */
export async function getLocationApplicants(
  filters: MapFilters,
  location: { districtId?: number; barangayId?: number },
  page: number,
  pageSize = APPLICANTS_PAGE_SIZE,
) {
  const where: Prisma.tbl_applicationWhereInput = { ...applicationWhere(filters) };
  if (location.barangayId) where.barangay_id = location.barangayId;
  else if (location.districtId) where.tbl_barangay = { district_id: location.districtId };

  const [total, rows] = await Promise.all([
    prisma.tbl_application.count({ where }),
    prisma.tbl_application.findMany({
      where,
      orderBy: [{ tbl_applicant: { last_name: "asc" } }, { application_no: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        application_no: true,
        tbl_applicant: {
          select: { applicant_id: true, first_name: true, middle_name: true, last_name: true, suffix: true },
        },
        tbl_school: { select: { school_name: true, city_municipality: true } },
        tbl_program: { select: { program_code: true, program_name: true } },
        tbl_barangay: { select: { barangay_name: true, tbl_district: { select: { district_name: true } } } },
        tbl_admission_stage: { select: { stage_name: true } },
        tbl_exam_result: {
          orderBy: { result_id: "desc" },
          take: 1,
          select: { percentage: true, result_status: true },
        },
      },
    }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      applicant_id: r.tbl_applicant?.applicant_id ?? null,
      application_no: r.application_no,
      full_name: formatFullName(r.tbl_applicant),
      school: r.tbl_school?.school_name ?? null,
      school_city: r.tbl_school?.city_municipality ?? null,
      program_code: r.tbl_program?.program_code ?? null,
      program_name: r.tbl_program?.program_name ?? null,
      barangay: r.tbl_barangay?.barangay_name ?? null,
      district: r.tbl_barangay?.tbl_district?.district_name ?? null,
      exam: r.tbl_exam_result[0]?.percentage == null ? null : Number(r.tbl_exam_result[0].percentage),
      exam_status: r.tbl_exam_result[0]?.result_status ?? null,
      stage: r.tbl_admission_stage?.stage_name ?? null,
    })),
  };
}
