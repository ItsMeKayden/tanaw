// Figures for the Analytics → Overview page. Archived applicants are left out,
// as on the Admission pages.
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { getPassingRule } from "@/features/admission/exam";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { latestPerApplication, mean, median, num, pct } from "@/features/reports/stats";
import { prisma } from "@/lib/prisma";

/** How many school years the year-over-year chart shows, ending at the selected one. */
export const TREND_YEARS = 5;

/** A failed examinee within this many points of the passing score counts as a near miss. */
export const NEAR_MISS_MARGIN = 5;

export type OverviewFilters = { cycleId: number | null; campusId: number | null; courseId: number | null };

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export async function getOverview({ cycleId, campusId, courseId }: OverviewFilters) {
  // Campus / course filters apply to every figure; the school year only to this-year figures.
  const scope = {
    ...ACTIVE_APPLICATION,
    ...(campusId ? { branch_id: campusId } : {}),
    ...(courseId ? { program_id: courseId } : {}),
  };
  const where = { ...scope, ...(cycleId ? { cycle_id: cycleId } : {}) };

  // School years oldest → newest, so the trend window ends at the selected year.
  const cyclesByDate = await prisma.tbl_admission_cycle.findMany({
    orderBy: [{ start_date: "asc" }, { cycle_id: "asc" }],
    select: { cycle_id: true, school_year: true },
  });
  const selectedIndex = cycleId ? cyclesByDate.findIndex((c) => c.cycle_id === cycleId) : cyclesByDate.length - 1;
  const trendCycles = selectedIndex < 0 ? [] : cyclesByDate.slice(Math.max(0, selectedIndex - TREND_YEARS + 1), selectedIndex + 1);
  const previousCycle = selectedIndex > 0 ? cyclesByDate[selectedIndex - 1] : null;

  const [passingRule, applicants, enrolled, trendRows, subjectResponses] = await Promise.all([
    cycleId ? getPassingRule(cycleId) : null,
    prisma.tbl_application.count({ where }),
    prisma.tbl_application.count({ where: { ...where, tbl_admission_stage: { stage_name: ADMISSION_STAGES.ENROLLED } } }),
    // Results of every trend year; this year's figures are the selected year's slice of it.
    prisma.tbl_exam_result.findMany({
      where: { tbl_application: { ...scope, cycle_id: { in: trendCycles.map((c) => c.cycle_id) } } },
      select: {
        result_id: true,
        application_id: true,
        percentage: true,
        raw_score: true,
        result_status: true,
        tbl_application: { select: { cycle_id: true, tbl_admission_stage: { select: { stage_name: true } } } },
      },
    }),
    prisma.tbl_question_response.findMany({
      where: { tbl_exam_result: { tbl_application: where } },
      select: {
        is_correct: true,
        points_earned: true,
        tbl_exam_question: { select: { points: true, tbl_competency: { select: { subject_area: true } } } },
      },
    }),
  ]);
  const results = latestPerApplication(trendRows);
  const thisYear = results.filter((r) => r.tbl_application?.cycle_id === cycleId);

  // ── This year ──
  const examinees = thisYear.length;
  const passedRows = thisYear.filter((r) => r.result_status === EXAM_RESULT_PASSED);
  const passed = passedRows.length;
  const waitlisted = passedRows.filter((r) => r.tbl_application?.tbl_admission_stage?.stage_name === ADMISSION_STAGES.WAITLISTED).length;
  const scores = thisYear.map((r) => num(r.percentage));
  const average = mean(scores);
  const passingRate = pct(passed, examinees);

  // Failed, but within NEAR_MISS_MARGIN of the passing score (points or percent, per the rule).
  const nearMiss = passingRule
    ? thisYear.filter((r) => {
        if (r.result_status === EXAM_RESULT_PASSED) return false;
        const score = passingRule.byPoints ? num(r.raw_score) : num(r.percentage);
        return score < passingRule.value && score >= passingRule.value - NEAR_MISS_MARGIN;
      }).length
    : 0;

  // ── Year over year ──
  const yearly = trendCycles.map((c) => {
    const inYear = results.filter((r) => r.tbl_application?.cycle_id === c.cycle_id);
    return {
      cycleId: c.cycle_id,
      label: c.school_year,
      passingRate: inYear.length ? pct(inYear.filter((r) => r.result_status === EXAM_RESULT_PASSED).length, inYear.length) : null,
      average: inYear.length ? mean(inYear.map((r) => num(r.percentage))) : null,
    };
  });
  const lastYear = previousCycle ? yearly.find((y) => y.cycleId === previousCycle.cycle_id) ?? null : null;
  const change = (current: number, before: number | null | undefined) =>
    examinees > 0 && previousCycle && before != null ? { value: current - before, against: previousCycle.school_year } : null;

  // ── Score distribution: 10-point ranges, split by the real pass/fail result ──
  const bins = Array.from({ length: 10 }, (_, index) => ({
    label: index === 9 ? "90–100" : `${index * 10}–${index * 10 + 9}`,
    values: { passed: 0, failed: 0 },
  }));
  for (const result of thisYear) {
    const index = Math.min(9, Math.max(0, Math.floor(num(result.percentage) / 10)));
    bins[index].values[result.result_status === EXAM_RESULT_PASSED ? "passed" : "failed"]++;
  }

  // ── Average score by subject ──
  const subjectTotals = new Map<string, { earned: number; possible: number }>();
  for (const response of subjectResponses) {
    const subject = response.tbl_exam_question.tbl_competency?.subject_area?.trim();
    if (!subject) continue;
    const total = subjectTotals.get(subject) ?? { earned: 0, possible: 0 };
    const points = response.tbl_exam_question.points ?? 0;
    total.possible += points;
    total.earned += response.points_earned ?? (response.is_correct ? points : 0);
    subjectTotals.set(subject, total);
  }
  const subjects = [...subjectTotals.entries()]
    .map(([label, total]) => ({ label, value: pct(total.earned, total.possible) }))
    .sort((a, b) => b.value - a.value);

  return {
    applicants,
    examinees,
    passed,
    failed: examinees - passed,
    waitlisted,
    admitted: passed - waitlisted,
    enrolled,
    passingRate,
    average,
    passingRule,
    nearMiss,
    passingRateChange: change(passingRate, lastYear?.passingRate),
    averageChange: change(average, lastYear?.average),
    stats: {
      mean: average,
      median: median(scores),
      deviation: standardDeviation(scores),
      lowest: scores.length ? Math.min(...scores) : 0,
      highest: scores.length ? Math.max(...scores) : 0,
    },
    bins,
    yearly,
    subjects,
  };
}
