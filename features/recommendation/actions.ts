"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  COMPETENCIES,
  DEFAULT_PROGRAM_WEIGHTS,
  FALLBACK_WEIGHTS,
} from "@/features/recommendation/config";
import { generateRecommendations } from "@/features/recommendation/engine";
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
 * Saves the course-to-competency weights. Each course's weights must be
 * whole or decimal percentages from 0–100 that add up to exactly 100.
 * Recommendations for the active cycle are regenerated afterwards.
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
    const cycleId = await activeCycleId();

    await prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          for (const w of row.weights) {
            await tx.tbl_program_competency.upsert({
              where: {
                program_id_competency_id: {
                  program_id: Number(row.program_id),
                  competency_id: Number(w.competency_id),
                },
              },
              update: { weight: Number(w.weight) },
              create: {
                program_id: Number(row.program_id),
                competency_id: Number(w.competency_id),
                weight: Number(w.weight),
              },
            });
          }
        }
        if (cycleId) await generateRecommendations(tx, { cycleId });
      },
      { timeout: 60_000 },
    );

    revalidateRecommendation();
    return { success: true, message: "Mapping saved and recommendations updated." };
  } catch (error) {
    console.error("Save mapping error:", error);
    return { error: "Something went wrong while saving the mapping." };
  }
}

/** Restores the default weights for every active course. */
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
      weights: COMPETENCIES.flatMap((competency, index) => {
        const match = competencies.find((c) => c.competency_name === competency.name);
        return match ? [{ competency_id: match.competency_id, weight: defaults[index] }] : [];
      }),
    };
  });

  const result = await saveMapping(rows);
  return "error" in result ? result : { success: true, message: "Default mapping restored." };
}
