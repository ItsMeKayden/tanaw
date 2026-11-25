import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, DonutChart, FilterBar, HorizontalBars, LineChart, ScoreHistogram, SelectFilter, VerticalBars } from "@/components/reports/analytics-ui";
import { tableStyles } from "@/components/ui/table-styles";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function pct(part: number, whole: number) { return whole ? Math.round((part / whole) * 1000) / 10 : 0; }
function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}
type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string; campus?: string; course?: string }> }>;

export default async function ReportsPage({ searchParams }: PageProps) {
  await connection();
  await requirePermission("reports", "read");
  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);
  const campusId = params.campus && params.campus !== "all" ? Number(params.campus) : null;
  const courseId = params.course && params.course !== "all" ? Number(params.course) : null;
  const [campuses, programs] = await Promise.all([
    prisma.tbl_branch.findMany({ orderBy: { branch_name: "asc" }, select: { branch_id: true, branch_name: true } }),
    prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true } }),
  ]);
  const where = { ...(cycle ? { cycle_id: cycle.cycle_id } : {}), ...(campusId ? { branch_id: campusId } : {}), ...(courseId ? { program_id: courseId } : {}) };
  const [applications, results, publicApplications, privateApplications, allCycles] = await Promise.all([
    prisma.tbl_application.findMany({ where, select: { application_id: true } }),
    prisma.tbl_exam_result.findMany({ where: { tbl_application: where }, select: { percentage: true, result_status: true } }),
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Public" } } }),
    prisma.tbl_application.count({ where: { ...where, tbl_school: { school_type: "Private" } } }),
    prisma.tbl_admission_cycle.findMany({ orderBy: { start_date: "asc" }, select: { cycle_id: true, school_year: true } }),
  ]);
  const passed = results.filter((r) => r.result_status === EXAM_RESULT_PASSED).length;
  const examined = results.length;
  const scores = results.map((r) => num(r.percentage));
  const average = scores.length ? scores.reduce((a,b) => a+b,0)/scores.length : 0;
  const highest = scores.length ? Math.max(...scores) : 0;
  const lowest = scores.length ? Math.min(...scores) : 0;
  const medianScore = median(scores);
  const deviation = standardDeviation(scores);

  const scoreBins = Array.from({ length: 10 }, (_, index) => {
    const min = index * 10;
    const max = min + 9;
    const inBin = scores.filter((score) => score >= min && (index === 9 ? score <= 100 : score <= max));
    return {
      label: String(min),
      publicValue: inBin.filter((score) => score < 50).length,
      privateValue: inBin.filter((score) => score >= 50).length,
    };
  });

  const subjectResponses = await prisma.tbl_question_response.findMany({
    where: { tbl_exam_result: { tbl_application: where } },
    select: {
      is_correct: true,
      points_earned: true,
      tbl_exam_question: {
        select: {
          points: true,
          tbl_competency: { select: { subject_area: true } },
        },
      },
    },
  });
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
  const subjectAverages = [...subjectTotals.entries()].map(([label, total]) => ({
    label,
    value: total.possible ? Math.round((total.earned / total.possible) * 1000) / 10 : 0,
  })).sort((a, b) => b.value - a.value);

  const averageScoreByYear = await Promise.all(allCycles.slice(-5).map(async (item) => {
    const cycleResults = await prisma.tbl_exam_result.findMany({
      where: {
        tbl_application: {
          cycle_id: item.cycle_id,
          ...(campusId ? { branch_id: campusId } : {}),
          ...(courseId ? { program_id: courseId } : {}),
        },
      },
      select: { percentage: true },
    });
    const cycleScores = cycleResults.map((r) => num(r.percentage));
    return {
      label: item.school_year,
      value: cycleScores.length ? cycleScores.reduce((sum, value) => sum + value, 0) / cycleScores.length : 0,
    };
  }));
  const trend = await Promise.all(allCycles.slice(-5).map(async (item) => {
    const rs = await prisma.tbl_exam_result.findMany({ where: { tbl_application: { cycle_id:item.cycle_id, ...(campusId ? {branch_id:campusId}:{}), ...(courseId ? {program_id:courseId}:{}) } }, select:{ percentage:true, result_status:true } });
    const passedInCycle = rs.filter((r) => r.result_status === EXAM_RESULT_PASSED).length;
    return {label:item.school_year,value:pct(passedInCycle,rs.length)};
  }));
  const [publicResults, privateResults] = await Promise.all([
    prisma.tbl_exam_result.findMany({where:{tbl_application:{...where,tbl_school:{school_type:"Public"}}},select:{percentage:true}}),
    prisma.tbl_exam_result.findMany({where:{tbl_application:{...where,tbl_school:{school_type:"Private"}}},select:{percentage:true}}),
  ]);
  const publicScores=publicResults.map((r)=>num(r.percentage));
  const privateScores=privateResults.map((r)=>num(r.percentage));
  const publicAverage=publicScores.length?publicScores.reduce((a,b)=>a+b,0)/publicScores.length:0;
  const privateAverage=privateScores.length?privateScores.reduce((a,b)=>a+b,0)/privateScores.length:0;
  const publicExamined=await prisma.tbl_application.count({where:{...where,tbl_school:{school_type:"Public"},tbl_exam_result:{some:{}}}});
  const publicPassed=await prisma.tbl_application.count({where:{...where,tbl_school:{school_type:"Public"},tbl_exam_result:{some:{result_status:EXAM_RESULT_PASSED}}}});
  const privateExamined=await prisma.tbl_application.count({where:{...where,tbl_school:{school_type:"Private"},tbl_exam_result:{some:{}}}});
  const privatePassed=await prisma.tbl_application.count({where:{...where,tbl_school:{school_type:"Private"},tbl_exam_result:{some:{result_status:EXAM_RESULT_PASSED}}}});

  const schoolBars=[
    {label:"Applicants",publicValue:publicApplications,privateValue:privateApplications},
    {label:"Took exam",publicValue:publicExamined,privateValue:privateExamined},
    {label:"Passed",publicValue:publicPassed,privateValue:privatePassed},
  ];
  return (
    <AnalyticsPage>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{label:"Passing rate",value:`${pct(passed,examined)}%`,note:"of examinees"},{label:"Average score",value:average.toFixed(1),note:"out of 100"},{label:"Highest score",value:highest.toFixed(1),note:"out of 100"},{label:"Examinees",value:examined,note:`${pct(examined,applications.length)}% of applicants`}].map((stat)=><div key={stat.label} className="rounded-xl border border-neutral-400 bg-white p-4"><p className="text-sm text-neutral-700">{stat.label}</p><p className="mt-1 text-3xl font-bold">{stat.value}</p><p className="text-xs text-neutral-500">{stat.note}</p></div>)}
      </div>
      <FilterBar action="/reports" exportHref={`/api/reports/overview?cycle=${cycle?.cycle_id ?? ""}${campusId ? `&campus=${campusId}` : ""}${courseId ? `&course=${courseId}` : ""}`}>
        <SelectFilter name="cycle" label="School Year" value={cycle?String(cycle.cycle_id):""} options={cycles.map((c)=>({value:String(c.cycle_id),label:c.school_year}))} />
        <SelectFilter name="campus" label="Campus" value={campusId?String(campusId):"all"} options={[{value:"all",label:"All"},...campuses.map((c)=>({value:String(c.branch_id),label:c.branch_name}))]} />
        <SelectFilter name="course" label="Course" value={courseId?String(courseId):"all"} options={[{value:"all",label:"All"},...programs.map((p)=>({value:String(p.program_id),label:p.program_code}))]} />
      </FilterBar>
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard><LineChart title="Passing rate by year (%)" points={trend} /></AnalyticsCard>
        <AnalyticsCard><DonutChart passed={passed} failed={examined-passed} title="Exam result" /></AnalyticsCard>
        <AnalyticsCard><VerticalBars title="Public vs Private applicants and exam results" items={schoolBars} /></AnalyticsCard>
        <AnalyticsCard title="Numbers">
          <div className={tableStyles.wrap}><table className="w-full border-collapse text-sm"><thead><tr className={tableStyles.headRow}><th className={tableStyles.th}>Metric</th><th className={`${tableStyles.th} text-right`}>Public</th><th className={`${tableStyles.th} text-right`}>Private</th></tr></thead><tbody className={tableStyles.body}>{[["Applicants",publicApplications,privateApplications],["Took exam",publicExamined,privateExamined],["Passed",publicPassed,privatePassed],["Passing rate",`${pct(publicPassed,publicExamined)}%`,`${pct(privatePassed,privateExamined)}%`],["Average score",publicAverage.toFixed(1),privateAverage.toFixed(1)]].map((row)=><tr key={String(row[0])} className={tableStyles.row}><td className={`${tableStyles.td} font-medium text-neutral-800`}>{row[0]}</td><td className={`${tableStyles.td} text-right tabular-nums`}>{row[1]}</td><td className={`${tableStyles.td} text-right tabular-nums`}>{row[2]}</td></tr>)}</tbody></table></div>
        </AnalyticsCard>
        {/* score distribution is shown below in the Figma layout */}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AnalyticsCard title="Exam scores per score range">
          <ScoreHistogram title="Examinees per score range" items={scoreBins} />
          <p className="mt-1 text-center text-sm">Below passing score vs passed shown in two tones</p>
        </AnalyticsCard>
        <AnalyticsCard title="Summary">
          <dl className="grid gap-4 py-3 text-sm">
            { [
              ["Mean", average.toFixed(1)],
              ["Median", medianScore.toFixed(1)],
              ["Std. deviation", deviation.toFixed(1)],
              ["Lowest", lowest.toFixed(1)],
              ["Highest", highest.toFixed(1)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-neutral-200 pb-3 last:border-0">
                <dt>{label}</dt><dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </AnalyticsCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AnalyticsCard title="Average score by subject">
          {subjectAverages.length ? (
            <HorizontalBars title="Average score by subject" items={subjectAverages.slice(0, 8)} />
          ) : (
            <p className="py-16 text-center text-sm text-neutral-500">No subject response data available.</p>
          )}
        </AnalyticsCard>
        <AnalyticsCard title="Average score by year">
          {averageScoreByYear.length ? (
            <LineChart title="Average score by year" points={averageScoreByYear} />
          ) : (
            <p className="py-16 text-center text-sm text-neutral-500">No exam score data available.</p>
          )}
        </AnalyticsCard>
      </div>
    </AnalyticsPage>
  );
}
