"use server";

import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  COMPETENCIES,
  DEFAULT_PROGRAM_WEIGHTS,
  FALLBACK_WEIGHTS,
  MIN_MATCH,
} from "@/features/recommendation/config";
import { generateRecommendations, isRecommendationEnabled } from "@/features/recommendation/engine";
import { mappingSaveSchema, rowTotal, type MappingSaveInput } from "@/features/recommendation/schemas";

type ActionResult = { success: true; message: string } | { error: string };

function revalidateRecommendation() {
  revalidatePath("/recommendation", "layout");
}

async function activeCycleId() {
  const cycle = await prisma.tbl_admission_cycle.findFirst({
    where: { is_active: true },
    orderBy: { start_date: "desc" },
    select: { cycle_id: true },
  });
  return cycle?.cycle_id ?? null;
}

/** Re-scores every examined application in a cycle. */
export async function generateRecommendationsAction(cycleIdInput: number): Promise<ActionResult> {
  await requirePermission("recommendation", "write");

  const cycleId = Number(cycleIdInput);
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0) return { error: "Invalid admission cycle." };

  if (!(await isRecommendationEnabled(prisma))) {
    return { error: "Recommendations are turned off. Turn them on in Mapping Settings first." };
  }

  try {
    const scored = await prisma.$transaction((tx) => generateRecommendations(tx, { cycleId }), {
      timeout: 60_000,
    });
    revalidateRecommendation();
    return {
      success: true,
      message:
        scored > 0
          ? `Recommendations generated for ${scored} applicant${scored === 1 ? "" : "s"}.`
          : "No applicants with scored exam answers were found.",
    };
  } catch (error) {
    console.error("Generate recommendations error:", error);
    return { error: "Something went wrong while generating recommendations." };
  }
}

/**
 * Saves the course-to-competency weights and each course's minimum match.
 * Each course's weights must be whole or decimal percentages from 0–100 that
 * add up to exactly 100. Recommendations for the active cycle are regenerated
 * afterwards (unless recommendations are turned off).
 */
export async function saveMapping(rawRows: MappingSaveInput): Promise<ActionResult> {
  await requirePermission("recommendation", "write");

  const parsedRows = mappingSaveSchema.safeParse(rawRows);
  if (!parsedRows.success) return { error: parsedRows.error.issues[0].message };
  const rows = parsedRows.data;

  const [programs, competencies] = await Promise.all([
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true } }),
    prisma.tbl_competency.findMany({ select: { competency_id: true } }),
  ]);
  const programCodes = new Map(programs.map((p) => [p.program_id, p.program_code]));
  const competencyIds = new Set(competencies.map((c) => c.competency_id));

  for (const row of rows) {
    const code = programCodes.get(Number(row.program_id));
    if (!code) return { error: "One of the courses no longer exists." };

    if (row.weights.some((w) => !competencyIds.has(w.competency_id))) return { error: "Unknown competency." };
    const total = rowTotal(row.weights);
    if (total !== 100) return { error: `${code}: weights add up to ${total}%, not 100%.` };
  }

  try {
    const [cycleId, enabled] = await Promise.all([activeCycleId(), isRecommendationEnabled(prisma)]);

    await prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          if (row.min_match !== undefined) {
            await tx.tbl_program.update({
              where: { program_id: Number(row.program_id) },
              data: { min_match: row.min_match },
            });
          }
          for (const w of row.weights) {
            await tx.tbl_program_competency.upsert({
              where: {
                program_id_competency_id: {
                  program_id: Number(row.program_id),
                  competency_id: Number(w.competency_id),
                },
              },
              update: {
                weight: Number(w.weight),
                ...(w.min_score !== undefined ? { min_score: w.min_score } : {}),
              },
              create: {
                program_id: Number(row.program_id),
                competency_id: Number(w.competency_id),
                weight: Number(w.weight),
                min_score: w.min_score ?? null,
              },
            });
          }
        }
        if (cycleId) await generateRecommendations(tx, { cycleId });
      },
      { timeout: 60_000 },
    );

    revalidateRecommendation();
    return {
      success: true,
      message: enabled
        ? "Mapping saved and recommendations updated."
        : "Mapping saved. Recommendations are turned off, so results were not regenerated.",
    };
  } catch (error) {
    console.error("Save mapping error:", error);
    return { error: "Something went wrong while saving the mapping." };
  }
}

/** Restores the default weights and minimum match for every active course and clears its subject minimums. */
export async function resetMapping(): Promise<ActionResult> {
  await requirePermission("recommendation", "write");

  const [programs, competencies] = await Promise.all([
    prisma.tbl_program.findMany({ where: { is_active: true }, select: { program_id: true, program_code: true } }),
    prisma.tbl_competency.findMany({ select: { competency_id: true, competency_name: true } }),
  ]);

  const rows = programs.map((program) => {
    const defaults = DEFAULT_PROGRAM_WEIGHTS[program.program_code] ?? FALLBACK_WEIGHTS;
    return {
      program_id: program.program_id,
      min_match: MIN_MATCH,
      weights: COMPETENCIES.flatMap((competency, index) => {
        const match = competencies.find((c) => c.competency_name === competency.name);
        // Defaults have no compatibility rules (subject minimums are cleared).
        return match ? [{ competency_id: match.competency_id, weight: defaults[index], min_score: null }] : [];
      }),
    };
  });

  const result = await saveMapping(rows);
  return "error" in result ? result : { success: true, message: "Default mapping restored." };
}

/**
 * Turns recommendation generation on or off. Turning it back on regenerates
 * the active school year so results catch up with any changes made while off.
 */
export async function setRecommendationsEnabled(enabled: boolean): Promise<ActionResult> {
  const user = await requirePermission("recommendation", "write");
  if (typeof enabled !== "boolean") return { error: "Invalid setting." };

  try {
    const accountId = getAccountId(user);
    const existing = await prisma.tbl_recommendation_setting.findFirst({
      orderBy: { setting_id: "asc" },
      select: { setting_id: true },
    });
    const data = { is_enabled: enabled, updated_by: accountId, updated_at: new Date() };
    if (existing) {
      await prisma.tbl_recommendation_setting.update({ where: { setting_id: existing.setting_id }, data });
    } else {
      await prisma.tbl_recommendation_setting.create({ data });
    }

    let scored = 0;
    if (enabled) {
      const cycleId = await activeCycleId();
      if (cycleId) {
        scored = await prisma.$transaction((tx) => generateRecommendations(tx, { cycleId }), { timeout: 60_000 });
      }
    }

    revalidateRecommendation();
    return {
      success: true,
      message: enabled
        ? `Recommendations turned on${scored > 0 ? ` and regenerated for ${scored} applicant${scored === 1 ? "" : "s"}` : ""}.`
        : "Recommendations turned off. Existing results stay visible but won't be updated.",
    };
  } catch (error) {
    console.error("Set recommendations enabled error:", error);
    return { error: "Something went wrong while saving the setting." };
  }
}
