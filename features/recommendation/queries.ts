// Server-side queries for the Course Recommendation pages (imports Prisma).
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
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
  const [applications, competencies, rules] = await Promise.all([
    prisma.tbl_application.findMany({
      where: { ...ACTIVE_APPLICATION, cycle_id: cycleId, tbl_exam_result: { some: {} } },
      orderBy: { application_no: "asc" },
      select: {
        application_id: true,
        application_no: true,
        tbl_applicant: {
          select: { applicant_id: true, first_name: true, middle_name: true, last_name: true, suffix: true },
        },
        tbl_program: { select: { program_id: true, program_code: true, program_name: true, min_match: true } },
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
            unmet_competency_ids: true,
            tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
          },
        },
      },
    }),
    prisma.tbl_competency.findMany({ select: { competency_id: true, competency_name: true } }),
    // Compatibility rules (minimum subject scores) of every course.
    prisma.tbl_program_competency.findMany({
      where: { min_score: { not: null } },
      select: { program_id: true, competency_id: true, min_score: true },
    }),
  ]);

  const competencyName = new Map(competencies.map((c) => [c.competency_id, shortCompetencyName(c.competency_name)]));
  const ruleMin = new Map(rules.map((r) => [`${r.program_id}:${r.competency_id}`, Number(r.min_score)]));

  return applications.map((application) => {
    const recs = application.tbl_course_recommendation;
    const top = recs[0];
    const preferred = application.tbl_program;
    const preferredRec = preferred ? recs.find((r) => r.program_id === preferred.program_id) : undefined;
    const preferredMatch = preferredRec ? Number(preferredRec.compatibility_score) : null;
    const exam = application.tbl_exam_result[0];
    const minMatch = preferred ? Number(preferred.min_match) : MIN_MATCH;

    // Advisory: preferred-course subjects below that course's minimum score.
    const shortfalls = preferred
      ? (preferredRec?.unmet_competency_ids ?? []).map((id) => ({
          label: competencyName.get(id) ?? "Subject",
          min: ruleMin.get(`${preferred.program_id}:${id}`) ?? null,
        }))
      : [];
    const meetsRules = shortfalls.length === 0;

    let status: RecommendationStatus = "NOT_GENERATED";
    if (top) {
      if (preferredMatch !== null && preferredMatch >= minMatch && meetsRules) status = "COMPATIBLE";
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
      /** Minimum match of the preferred course. */
      min_match: minMatch,
      /** Preferred-course subject rules the applicant does not meet (advisory). */
      shortfalls,
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
    where: { application_id: applicationId, ...ACTIVE_APPLICATION },
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
          unmet_competency_ids: true,
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
    /** Subjects below this course's minimum score (advisory). */
    unmet: r.unmet_competency_ids,
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
    } else if (top.match >= preferredRank.match) {
      const gap = Math.round((top.match - preferredRank.match) * 10) / 10;
      reasons.push(
        `Preferred course ${preferred.program_code} matches ${preferredRank.match}% (rank ${preferredRank.rank}); ${top.program_code} is ${gap} points higher.`,
      );
    } else {
      reasons.push(
        `Preferred course ${preferred.program_code} matches ${preferredRank.match}%, but ${top.program_code} (${top.match}%) is ranked first because its subject minimums are met.`,
      );
    }

    const preferredRules = data.programs.find((p) => p.program_id === preferred.program_id)?.weights ?? [];
    const unmet = preferredRank.unmet
      .map((id) => {
        const rule = preferredRules.find((w) => w.competency_id === id);
        const score = data.competencyScores.find((c) => c.competency_id === id);
        return score && rule?.min_score != null
          ? `${shortCompetencyName(score.competency_name)} ${score.percent ?? 0}% (needs ${rule.min_score}%)`
          : null;
      })
      .filter((text): text is string => text !== null);
    if (unmet.length > 0) {
      reasons.push(`Below ${preferred.program_code}'s subject minimums: ${unmet.join(", ")}. This is advisory only.`);
    }

    const preferredProgram = data.programs.find((p) => p.program_id === preferred.program_id);
    const minMatch = preferredProgram?.min_match ?? MIN_MATCH;
    if (preferredRank.match < minMatch) {
      const weakest = preferredProgram
        ? [...preferredProgram.weights]
            .filter((w) => w.weight > 0)
            .map((w) => ({ w, score: scored.find((c) => c.competency_id === w.competency_id) }))
            .sort((a, b) => (a.score?.percent ?? 0) * 1 - (b.score?.percent ?? 0) * 1)[0]
        : undefined;
      reasons.push(
        `${preferred.program_code} is below its ${minMatch}% minimum match${
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
    where: { ...ACTIVE_APPLICATION, cycle_id: cycleId, tbl_course_recommendation: { some: {} } },
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

/** Course Recommendation settings (Mapping Settings page). */
export async function getRecommendationSettings() {
  const setting = await prisma.tbl_recommendation_setting.findFirst({
    orderBy: { setting_id: "asc" },
    select: { is_enabled: true, updated_at: true, tbl_user_account: { select: { full_name: true } } },
  });
  return {
    enabled: setting?.is_enabled ?? true,
    updated_at: setting?.updated_at.toISOString() ?? null,
    updated_by: setting?.tbl_user_account?.full_name ?? null,
  };
}
