// Server-side recommendation engine. Takes the Prisma client as a parameter
// so both the app and the seeder can use it. Relative imports on purpose
// (the seeder runs outside Next.js).
import type { Prisma } from "../../generated/prisma/client";
import { computeMatch } from "./config";

type Db = Prisma.TransactionClient;

export type CompetencyScore = {
  competency_id: number;
  competency_name: string;
  earned: number;
  possible: number;
  /** 0–100, or null when the exam had no questions for it. */
  percent: number | null;
};

/** Per-competency scores for one exam result, from its question responses. */
export async function getCompetencyScores(db: Db, resultId: number) {
  const [competencies, responses] = await Promise.all([
    db.tbl_competency.findMany({
      orderBy: { competency_id: "asc" },
      select: { competency_id: true, competency_name: true },
    }),
    db.tbl_question_response.findMany({
      where: { result_id: resultId },
      select: {
        points_earned: true,
        is_correct: true,
        tbl_exam_question: { select: { competency_id: true, points: true } },
      },
    }),
  ]);

  return competencies.map<CompetencyScore>((competency) => {
    const answered = responses.filter(
      (r) => r.tbl_exam_question.competency_id === competency.competency_id,
    );
    const possible = answered.reduce((sum, r) => sum + r.tbl_exam_question.points, 0);
    const earned = answered.reduce(
      (sum, r) =>
        sum + (r.points_earned ?? (r.is_correct ? r.tbl_exam_question.points : 0)),
      0,
    );
    return {
      competency_id: competency.competency_id,
      competency_name: competency.competency_name,
      earned,
      possible,
      percent: possible > 0 ? Math.round((earned / possible) * 10_000) / 100 : null,
    };
  });
}

/** Active programs with their competency weights (programs without weights are skipped). */
export async function getProgramWeights(db: Db) {
  const programs = await db.tbl_program.findMany({
    where: { is_active: true },
    orderBy: { program_code: "asc" },
    select: {
      program_id: true,
      program_code: true,
      program_name: true,
      tbl_program_competency: { select: { competency_id: true, weight: true } },
    },
  });

  return programs.map((program) => ({
    program_id: program.program_id,
    program_code: program.program_code,
    program_name: program.program_name,
    weights: program.tbl_program_competency.map((w) => ({
      competency_id: w.competency_id,
      weight: Number(w.weight),
    })),
  }));
}

/**
 * (Re)generates tbl_course_recommendation for applications in a cycle that
 * have an exam result with question responses. Every weighted course is
 * scored and ranked (1 = best match). Returns how many applications were scored.
 */
export async function generateRecommendations(
  db: Db,
  options: { cycleId: number; applicationIds?: number[] },
) {
  const [applications, programs] = await Promise.all([
    db.tbl_application.findMany({
      where: {
        cycle_id: options.cycleId,
        ...(options.applicationIds ? { application_id: { in: options.applicationIds } } : {}),
        tbl_exam_result: { some: { tbl_question_response: { some: {} } } },
      },
      select: {
        application_id: true,
        tbl_exam_result: {
          where: { tbl_question_response: { some: {} } },
          orderBy: { result_id: "desc" },
          take: 1,
          select: { result_id: true },
        },
      },
    }),
    getProgramWeights(db),
  ]);

  const weighted = programs.filter((p) => p.weights.some((w) => w.weight > 0));
  const generatedAt = new Date();
  let scored = 0;

  for (const application of applications) {
    const result = application.tbl_exam_result[0];
    if (!result) continue;

    const competencyScores = await getCompetencyScores(db, result.result_id);
    const scores = new Map(
      competencyScores
        .filter((c) => c.percent !== null)
        .map((c) => [c.competency_id, c.percent as number]),
    );

    const ranked = weighted
      .map((program) => ({
        program_id: program.program_id,
        match: computeMatch(scores, program.weights),
      }))
      .filter((r): r is { program_id: number; match: number } => r.match !== null)
      .sort((a, b) => b.match - a.match);

    await db.tbl_course_recommendation.deleteMany({
      where: { application_id: application.application_id },
    });

    if (ranked.length > 0) {
      await db.tbl_course_recommendation.createMany({
        data: ranked.map((r, index) => ({
          application_id: application.application_id,
          program_id: r.program_id,
          compatibility_score: r.match,
          rank_no: index + 1,
          generated_at: generatedAt,
        })),
      });
      scored++;
    }
  }

  return scored;
}
