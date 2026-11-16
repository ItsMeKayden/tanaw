// Server-side queries for the Course Recommendation pages (imports Prisma).
import { prisma } from "@/lib/prisma";
import { formatFullName } from "@/features/admission/enrollment-queries";
import { MIN_MATCH, shortCompetencyName } from "@/features/recommendation/config";
import {
  getCompetencyScores,
  getProgramWeights,
  SCORED_RESULT,
  type CompetencyScore,
} from "@/features/recommendation/engine";

/**
 * COMPATIBLE     preferred course meets the minimum match
 * ALTERNATIVE    preferred course is below the minimum and another course matches better
 * BELOW_MINIMUM  preferred course is below the minimum and is already the best match
 * NOT_GENERATED  no recommendation yet
 */
export type RecommendationStatus = "COMPATIBLE" | "ALTERNATIVE" | "BELOW_MINIMUM" | "NOT_GENERATED";

type ProgramRef = { program_id: number; program_code: string; program_name: string };

/** Applications in a cycle that took the exam, with their top recommendation. */
export async function getRecommendationList(cycleId: number) {
  const applications = await prisma.tbl_application.findMany({
    where: { cycle_id: cycleId, tbl_exam_result: { some: {} } },
    orderBy: { application_no: "asc" },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: {
        select: { applicant_id: true, first_name: true, middle_name: true, last_name: true, suffix: true },
      },
      tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
      tbl_exam_result: {
        orderBy: { result_id: "desc" },
        take: 1,
        select: { percentage: true },
      },
      tbl_course_recommendation: {
        orderBy: { rank_no: "asc" },
        select: {
          program_id: true,
          compatibility_score: true,
          rank_no: true,
          generated_at: true,
          tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
        },
      },
    },
  });

  return applications.map((application) => {
    const recs = application.tbl_course_recommendation;
    const top = recs[0];
    const preferred = application.tbl_program;
    const preferredRec = preferred ? recs.find((r) => r.program_id === preferred.program_id) : undefined;
    const preferredMatch = preferredRec ? Number(preferredRec.compatibility_score) : null;
    const exam = application.tbl_exam_result[0];

    let status: RecommendationStatus = "NOT_GENERATED";
    if (top) {
      if (preferredMatch !== null && preferredMatch >= MIN_MATCH) status = "COMPATIBLE";
      else if (preferred && top.program_id === preferred.program_id) status = "BELOW_MINIMUM";
      else status = "ALTERNATIVE";
    }

    return {
      application_id: application.application_id,
      application_no: application.application_no,
      applicant_id: application.tbl_applicant?.applicant_id ?? null,
      full_name: formatFullName(application.tbl_applicant),
      exam_percentage: exam?.percentage == null ? null : Number(exam.percentage),
      preferred: preferred ? { code: preferred.program_code, name: preferred.program_name, id: preferred.program_id } : null,
      preferred_match: preferredMatch,
      recommended: top ? { code: top.tbl_program.program_code, name: top.tbl_program.program_name, id: top.program_id } : null,
      recommended_match: top ? Number(top.compatibility_score) : null,
      generated_at: top?.generated_at?.toISOString() ?? null,
      status,
    };
  });
}

export type RecommendationRow = Awaited<ReturnType<typeof getRecommendationList>>[number];

/** Everything the detail, breakdown, and comparison pages need for one application. */
export async function getApplicationRecommendation(applicationId: number) {
  const application = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    select: {
      application_id: true,
      application_no: true,
      cycle_id: true,
      tbl_applicant: {
        select: { applicant_id: true, first_name: true, middle_name: true, last_name: true, suffix: true },
      },
      tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
      program_choice_2: { select: { program_id: true, program_code: true, program_name: true } },
      program_choice_3: { select: { program_id: true, program_code: true, program_name: true } },
      tbl_exam_result: {
        where: SCORED_RESULT,
        orderBy: { result_id: "desc" },
        take: 1,
        select: { result_id: true, raw_score: true, percentage: true, tbl_exam: { select: { max_score: true } } },
      },
      tbl_course_recommendation: {
        orderBy: { rank_no: "asc" },
        select: {
          program_id: true,
          compatibility_score: true,
          rank_no: true,
          generated_at: true,
          tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
        },
      },
    },
  });

  if (!application) return null;

  const result = application.tbl_exam_result[0];
  const [competencyScores, programs] = await Promise.all([
    result ? getCompetencyScores(prisma, result.result_id) : Promise.resolve([] as CompetencyScore[]),
    getProgramWeights(prisma),
  ]);

  const ranking = application.tbl_course_recommendation.map((r) => ({
    ...r.tbl_program,
    match: Number(r.compatibility_score),
    rank: r.rank_no ?? 0,
  }));

  return {
    application_id: application.application_id,
    application_no: application.application_no,
    cycle_id: application.cycle_id,
    applicant_id: application.tbl_applicant?.applicant_id ?? null,
    full_name: formatFullName(application.tbl_applicant),
    exam: result
      ? {
          raw_score: result.raw_score,
          max_score: result.tbl_exam?.max_score ?? null,
          percentage: result.percentage == null ? null : Number(result.percentage),
        }
      : null,
    choices: [application.tbl_program, application.program_choice_2, application.program_choice_3].filter(
      (p): p is ProgramRef => p !== null,
    ),
    preferred: application.tbl_program,
    competencyScores,
    ranking,
    generated_at: application.tbl_course_recommendation[0]?.generated_at?.toISOString() ?? null,
    programs,
  };
}

export type ApplicationRecommendation = NonNullable<Awaited<ReturnType<typeof getApplicationRecommendation>>>;

/** Plain-language reasons for the top recommendation. */
export function buildReasons(data: ApplicationRecommendation) {
  const reasons: string[] = [];
  const top = data.ranking[0];
  if (!top) return reasons;

  const scored = data.competencyScores.filter((c) => c.percent !== null) as (CompetencyScore & { percent: number })[];
  const byScore = [...scored].sort((a, b) => b.percent - a.percent);

  if (byScore.length >= 2) {
    reasons.push(
      `Strongest areas: ${byScore
        .slice(0, 2)
        .map((c) => `${shortCompetencyName(c.competency_name)} (${c.percent}%)`)
        .join(" and ")}.`,
    );
  }

  const topProgram = data.programs.find((p) => p.program_id === top.program_id);
  if (topProgram) {
    const emphasis = [...topProgram.weights].sort((a, b) => b.weight - a.weight).slice(0, 2);
    const parts = emphasis.map((w) => {
      const score = scored.find((c) => c.competency_id === w.competency_id);
      const name = shortCompetencyName(score?.competency_name ?? "");
      return `${name} (${w.weight}% of the match; applicant scored ${score?.percent ?? 0}%)`;
    });
    reasons.push(`${top.program_code} weighs ${parts.join(" and ")} most heavily.`);
  }

  const preferred = data.preferred;
  const preferredRank = preferred ? data.ranking.find((r) => r.program_id === preferred.program_id) : undefined;

  if (preferred && preferredRank) {
    if (preferredRank.program_id === top.program_id) {
      reasons.push(`The preferred course is also the best match (${top.match}%).`);
    } else {
      const gap = Math.round((top.match - preferredRank.match) * 10) / 10;
      reasons.push(
        `Preferred course ${preferred.program_code} matches ${preferredRank.match}% (rank ${preferredRank.rank}); ${top.program_code} is ${gap} points higher.`,
      );
    }

    if (preferredRank.match < MIN_MATCH) {
      const preferredProgram = data.programs.find((p) => p.program_id === preferred.program_id);
      const weakest = preferredProgram
        ? [...preferredProgram.weights]
            .filter((w) => w.weight > 0)
            .map((w) => ({ w, score: scored.find((c) => c.competency_id === w.competency_id) }))
            .sort((a, b) => (a.score?.percent ?? 0) * 1 - (b.score?.percent ?? 0) * 1)[0]
        : undefined;
      reasons.push(
        `${preferred.program_code} is below the ${MIN_MATCH}% minimum match${
          weakest?.score ? `, mainly because of ${shortCompetencyName(weakest.score.competency_name)} (${weakest.score.percent}%)` : ""
        }.`,
      );
    }
  }

  if (data.exam?.percentage != null) {
    reasons.push(`Overall exam score: ${data.exam.percentage}%.`);
  }

  return reasons;
}

/** Applications with recommendations, for the applicant pickers. */
export async function getRecommendedApplicants(cycleId: number) {
  const applications = await prisma.tbl_application.findMany({
    where: { cycle_id: cycleId, tbl_course_recommendation: { some: {} } },
    orderBy: { application_no: "asc" },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: { select: { first_name: true, middle_name: true, last_name: true, suffix: true } },
    },
  });

  return applications.map((a) => ({
    application_id: a.application_id,
    label: `${formatFullName(a.tbl_applicant)} (${a.application_no})`,
  }));
}
