// Figures for Analytics → Schools & Passing Rate (page and export). Archived
// applicants are left out, as on the Admission pages.
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { getPassingRule } from "@/features/admission/exam";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { latestPerApplication, mean, median, num, pct } from "@/features/reports/stats";
import { prisma } from "@/lib/prisma";

export const SCHOOL_TYPES = ["Public", "Private"] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];

/** A school needs at least this many examinees before its pass rate is called out. */
export const MIN_EXAMINEES_FOR_RATE = 3;

/** How many schools each ranking lists. */
export const RANK_SIZE = 10;

export type SchoolsFilters = { cycleId: number | null; campusId: number | null; type: SchoolType | null };

export function parseSchoolType(value: string | null | undefined): SchoolType | null {
  return SCHOOL_TYPES.find((type) => type === value) ?? null;
}

type Tally = { applicants: number; examinees: number; passed: number; scores: number[] };
const emptyTally = (): Tally => ({ applicants: 0, examinees: 0, passed: 0, scores: [] });
const summarize = (t: Tally) => ({
  applicants: t.applicants,
  examinees: t.examinees,
  passed: t.passed,
  failed: t.examinees - t.passed,
  passingRate: pct(t.passed, t.examinees),
  average: mean(t.scores),
});

export async function getSchoolsReport({ cycleId, campusId, type }: SchoolsFilters) {
  // Year + campus apply everywhere; the Public/Private filter applies to everything
  // except the Public vs Private comparison, which always shows both.
  const base = {
    ...ACTIVE_APPLICATION,
    ...(cycleId ? { cycle_id: cycleId } : {}),
    ...(campusId ? { branch_id: campusId } : {}),
  };

  const [passingRule, applications, resultRows, programs] = await Promise.all([
    cycleId ? getPassingRule(cycleId) : null,
    prisma.tbl_application.findMany({
      where: base,
      select: {
        application_id: true,
        program_id: true,
        tbl_school: { select: { school_id: true, school_name: true, school_type: true } },
      },
    }),
    prisma.tbl_exam_result.findMany({
      where: { tbl_application: base },
      select: {
        result_id: true,
        application_id: true,
        percentage: true,
        result_status: true,
        tbl_application: { select: { tbl_admission_stage: { select: { stage_name: true } } } },
      },
    }),
    prisma.tbl_program.findMany({ select: { program_id: true, program_code: true, program_name: true } }),
  ]);

  const results = new Map(latestPerApplication(resultRows).map((r) => [r.application_id!, r]));
  const inType = (schoolType: string | null | undefined) => !type || schoolType === type;

  const overall = emptyTally();
  let waitlisted = 0;
  const byType = new Map<SchoolType, Tally>(SCHOOL_TYPES.map((t) => [t, emptyTally()]));
  const byCourse = new Map<number, Tally>();
  const bySchool = new Map<number, Tally & { name: string; type: string | null }>();

  for (const application of applications) {
    const school = application.tbl_school;
    const result = results.get(application.application_id);
    const passed = result?.result_status === EXAM_RESULT_PASSED;
    const add = (tally: Tally) => {
      tally.applicants++;
      if (!result) return;
      tally.examinees++;
      if (passed) tally.passed++;
      tally.scores.push(num(result.percentage));
    };

    const typeTally = byType.get(school?.school_type as SchoolType);
    if (typeTally) add(typeTally);

    if (!inType(school?.school_type)) continue;
    add(overall);
    if (passed && result?.tbl_application?.tbl_admission_stage?.stage_name === ADMISSION_STAGES.WAITLISTED) waitlisted++;

    if (application.program_id !== null) {
      const course = byCourse.get(application.program_id) ?? emptyTally();
      add(course);
      byCourse.set(application.program_id, course);
    }
    if (school) {
      const entry = bySchool.get(school.school_id) ?? { ...emptyTally(), name: school.school_name, type: school.school_type };
      add(entry);
      bySchool.set(school.school_id, entry);
    }
  }

  const programById = new Map(programs.map((p) => [p.program_id, p]));
  const courses = [...byCourse.entries()]
    .map(([id, tally]) => ({
      code: programById.get(id)?.program_code ?? "Unknown",
      name: programById.get(id)?.program_name ?? "Unknown course",
      ...summarize(tally),
    }))
    .filter((course) => course.examinees > 0)
    .sort((a, b) => b.passingRate - a.passingRate || b.examinees - a.examinees);

  const schools = [...bySchool.values()].map((s) => ({ name: s.name, type: s.type, ...summarize(s) }));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const summary = summarize(overall);
  return {
    passingRule,
    ...summary,
    waitlisted,
    admitted: summary.passed - waitlisted,
    median: overall.scores.length ? median(overall.scores) : null,
    highest: overall.scores.length ? Math.max(...overall.scores) : null,
    lowest: overall.scores.length ? Math.min(...overall.scores) : null,
    schoolCount: schools.length,
    courses,
    types: SCHOOL_TYPES.map((t) => ({ type: t, ...summarize(byType.get(t)!) })),
    schools,
    mostApplicants: schools
      .filter((s) => s.applicants > 0)
      .sort((a, b) => b.applicants - a.applicants || byName(a, b))
      .slice(0, RANK_SIZE),
    mostPassers: schools
      .filter((s) => s.passed > 0)
      .sort((a, b) => b.passed - a.passed || b.passingRate - a.passingRate || byName(a, b))
      .slice(0, RANK_SIZE),
  };
}

export type SchoolsReport = Awaited<ReturnType<typeof getSchoolsReport>>;
