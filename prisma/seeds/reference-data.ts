import { readFileSync } from "node:fs";
import path from "node:path";

import { ADMISSION_STAGE_ORDER } from "../../features/admission/stages";
import {
  COMPETENCIES,
  DEFAULT_PROGRAM_WEIGHTS,
  FALLBACK_WEIGHTS,
} from "../../features/recommendation/config";
import { log, prisma, warn } from "./client";
import { normalizeBarangayName } from "./geo/match";
import { campuses, districtBarangays, programs } from "./data";

/** The canonical admission stages, in pipeline order. */
export async function seedAdmissionStages() {
  for (const [index, stageName] of ADMISSION_STAGE_ORDER.entries()) {
    const existing = await prisma.tbl_admission_stage.findFirst({
      where: { stage_name: stageName },
      select: { stage_id: true },
    });

    if (existing) {
      await prisma.tbl_admission_stage.update({
        where: { stage_id: existing.stage_id },
        data: { stage_order: index + 1 },
      });
    } else {
      await prisma.tbl_admission_stage.create({
        data: { stage_name: stageName, stage_order: index + 1 },
      });
    }
  }

  log("reference", `${ADMISSION_STAGE_ORDER.length} admission stages`);
}

export async function seedDistrictsAndBarangays() {
  let barangayCount = 0;

  for (const item of districtBarangays) {
    const district =
      (await prisma.tbl_district.findFirst({ where: { district_name: item.district } })) ??
      (await prisma.tbl_district.create({ data: { district_name: item.district } }));

    const existing = new Set(
      (
        await prisma.tbl_barangay.findMany({
          where: { district_id: district.district_id },
          select: { barangay_name: true },
        })
      ).map((b) => b.barangay_name),
    );

    const missing = item.barangays.filter((name) => !existing.has(name));
    if (missing.length > 0) {
      await prisma.tbl_barangay.createMany({
        data: missing.map((barangay_name) => ({
          barangay_name,
          district_id: district.district_id,
        })),
      });
    }

    barangayCount += item.barangays.length;
  }

  log("reference", `${districtBarangays.length} districts, ${barangayCount} barangays`);
}

export async function seedCampusesAndPrograms() {
  for (const campus of campuses) {
    const existing = await prisma.tbl_branch.findFirst({
      where: { branch_code: campus.branch_code },
    });
    if (!existing) {
      await prisma.tbl_branch.create({ data: { ...campus, is_active: true } });
    }
  }

  for (const program of programs) {
    const existing = await prisma.tbl_program.findFirst({
      where: { program_code: program.program_code },
    });
    if (!existing) {
      await prisma.tbl_program.create({ data: { ...program, is_active: true } });
    }
  }

  log("reference", `${campuses.length} campuses, ${programs.length} programs`);
}

/** A starter list of feeder schools (more are added through the applicant form). */
const SCHOOLS = [
  { school_name: "Quezon City Science High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Commonwealth High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Batasan Hills National High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "San Bartolome High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Novaliches High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Payatas B National High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Lagro High School", school_type: "Public", city_municipality: "Quezon City" },
  { school_name: "Miriam College High School", school_type: "Private", city_municipality: "Quezon City" },
  { school_name: "St. Paul College Quezon City", school_type: "Private", city_municipality: "Quezon City" },
  { school_name: "Our Lady of Fatima University - QC", school_type: "Private", city_municipality: "Quezon City" },
];

export async function seedSchools() {
  let created = 0;
  for (const school of SCHOOLS) {
    const existing = await prisma.tbl_school.findFirst({
      where: { school_name: { equals: school.school_name, mode: "insensitive" } },
      select: { school_id: true },
    });
    if (!existing) {
      await prisma.tbl_school.create({ data: school });
      created++;
    }
  }
  log("reference", `${SCHOOLS.length} schools (${created} new)`);
}

export const DEFAULT_CYCLE = {
  school_year: "2026-2027",
  start_date: new Date("2026-08-01T00:00:00.000Z"),
  end_date: new Date("2027-06-30T00:00:00.000Z"),
};

/**
 * Ensures an admission cycle exists. Creates the default cycle (active)
 * only when none exists, so a cycle you configured is never overwritten.
 */
export async function seedAdmissionCycle() {
  const existing = await prisma.tbl_admission_cycle.findFirst({
    where: { school_year: DEFAULT_CYCLE.school_year },
  });

  if (!existing) {
    const anyActive = await prisma.tbl_admission_cycle.count({ where: { is_active: true } });
    await prisma.tbl_admission_cycle.create({
      data: { ...DEFAULT_CYCLE, is_active: anyActive === 0 },
    });
    log("reference", `admission cycle ${DEFAULT_CYCLE.school_year} created`);
  } else {
    log("reference", `admission cycle ${DEFAULT_CYCLE.school_year} already exists`);
  }

  const active = await prisma.tbl_admission_cycle.count({ where: { is_active: true } });
  if (active === 0) {
    warn("reference", "no admission cycle is active — new applicants cannot be added until one is.");
  }
}

/** Default passing score (75%) for the active cycle, if it has none. */
export async function seedPassingScore() {
  const cycle = await prisma.tbl_admission_cycle.findFirst({
    where: { is_active: true },
    orderBy: { start_date: "desc" },
    select: { cycle_id: true, start_date: true, school_year: true },
  });
  if (!cycle) return;

  const existing = await prisma.tbl_passing_score_setting.count({
    where: { cycle_id: cycle.cycle_id },
  });
  if (existing > 0) {
    log("reference", `passing score for ${cycle.school_year} already set`);
    return;
  }

  const admin = await prisma.tbl_user_account.findFirst({
    where: { username: "systemadmin" },
    select: { user_id: true },
  });

  await prisma.tbl_passing_score_setting.create({
    data: {
      cycle_id: cycle.cycle_id,
      updated_by: admin?.user_id ?? null,
      criteria_type: "PERCENTAGE",
      passing_value: 75,
      target_pass_rate: 0.6,
      effective_date: cycle.start_date,
    },
  });

  log("reference", `passing score for ${cycle.school_year}: 75% (target pass rate 60%)`);
}

/** Exam competencies (tbl_competency). */
export async function seedCompetencies() {
  let created = 0;
  for (const competency of COMPETENCIES) {
    const existing = await prisma.tbl_competency.findFirst({
      where: { competency_name: competency.name },
      select: { competency_id: true },
    });
    if (!existing) {
      await prisma.tbl_competency.create({
        data: {
          competency_name: competency.name,
          subject_area: competency.subject_area,
          description: competency.description,
        },
      });
      created++;
    }
  }
  log("reference", `${COMPETENCIES.length} competencies (${created} new)`);
}

/**
 * Default course-to-competency weights, only for courses that have no
 * weights yet (so mapping changes made in the app are kept).
 */
export async function seedProgramCompetencies() {
  const [programs, competencies] = await Promise.all([
    prisma.tbl_program.findMany({
      select: { program_id: true, program_code: true, _count: { select: { tbl_program_competency: true } } },
    }),
    prisma.tbl_competency.findMany({ select: { competency_id: true, competency_name: true } }),
  ]);

  let mapped = 0;
  for (const program of programs) {
    if (program._count.tbl_program_competency > 0) continue;
    const weights = DEFAULT_PROGRAM_WEIGHTS[program.program_code] ?? FALLBACK_WEIGHTS;
    await prisma.tbl_program_competency.createMany({
      data: COMPETENCIES.flatMap((competency, index) => {
        const match = competencies.find((c) => c.competency_name === competency.name);
        return match
          ? [{ program_id: program.program_id, competency_id: match.competency_id, weight: weights[index] }]
          : [];
      }),
      skipDuplicates: true,
    });
    mapped++;
  }

  log("reference", `course-to-competency weights (${mapped} course${mapped === 1 ? "" : "s"} given defaults)`);
}

/**
 * Barangay boundaries from prisma/seeds/geo/qc-barangays.geojson
 * (NAMRIA/PSA via OCHA COD-AB, CC BY-IGO) into tbl_barangay.boundary_geojson,
 * and each district's boundary as a MultiPolygon of its barangays.
 */
export async function seedBoundaries() {
  const file = path.join(process.cwd(), "prisma", "seeds", "geo", "qc-barangays.geojson");
  const geo = JSON.parse(readFileSync(file, "utf8")) as {
    features: { properties: { adm4_en: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  const byName = new Map(geo.features.map((f) => [normalizeBarangayName(f.properties.adm4_en), f.geometry]));

  const barangays = await prisma.tbl_barangay.findMany({
    select: { barangay_id: true, barangay_name: true, district_id: true, boundary_geojson: true },
  });

  const unmatched: string[] = [];
  const districtPolygons = new Map<number, unknown[]>();
  let updated = 0;

  for (const barangay of barangays) {
    const geometry = byName.get(normalizeBarangayName(barangay.barangay_name));
    if (!geometry) {
      unmatched.push(barangay.barangay_name);
      continue;
    }
    const text = JSON.stringify(geometry);
    if (barangay.boundary_geojson !== text) {
      await prisma.tbl_barangay.update({
        where: { barangay_id: barangay.barangay_id },
        data: { boundary_geojson: text },
      });
      updated++;
    }
    if (barangay.district_id !== null) {
      const list = districtPolygons.get(barangay.district_id) ?? [];
      if (geometry.type === "Polygon") list.push(geometry.coordinates);
      else if (geometry.type === "MultiPolygon") list.push(...(geometry.coordinates as unknown[]));
      districtPolygons.set(barangay.district_id, list);
    }
  }

  for (const [districtId, polygons] of districtPolygons) {
    await prisma.tbl_district.update({
      where: { district_id: districtId },
      data: { boundary_geojson: JSON.stringify({ type: "MultiPolygon", coordinates: polygons }) },
    });
  }

  log("reference", `map boundaries: ${barangays.length - unmatched.length}/${barangays.length} barangays (${updated} updated), ${districtPolygons.size} districts`);
  if (unmatched.length > 0) {
    warn("reference", `no boundary found for: ${unmatched.join(", ")}`);
  }
}
