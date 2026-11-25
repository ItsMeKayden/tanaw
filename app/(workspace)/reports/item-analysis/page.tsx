import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, DonutChart, FilterBar, HorizontalBars, Insight, SelectFilter } from "@/components/reports/analytics-ui";
import { PaginatedBars } from "@/components/reports/paginated-bars";
import { tableStyles } from "@/components/ui/table-styles";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function pct(part: number, whole: number) { return whole ? Math.round((part / whole) * 1000) / 10 : 0; }
type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string; campus?: string; exam?: string; subject?: string }> }>;

export default async function ItemAnalysisPage({ searchParams }: PageProps) {
 await connection(); await requirePermission("reports", "read");
 const params = await searchParams; const { cycles, cycle } = await resolveCycle(params.cycle);
 const campusId = params.campus && params.campus !== "all" ? Number(params.campus) : null;
 const [exams, competencies, campuses, programs] = await Promise.all([
  prisma.tbl_exam.findMany({ where: { ...(cycle ? { cycle_id: cycle.cycle_id } : {}) }, orderBy: { exam_name: "asc" }, select: { exam_id: true, exam_name: true } }),
  prisma.tbl_competency.findMany({ orderBy: { competency_name: "asc" }, select: { competency_id: true, competency_name: true, subject_area: true } }),
  prisma.tbl_branch.findMany({ orderBy: { branch_name: "asc" }, select: { branch_id: true, branch_name: true } }),
  prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true } }),
 ]);
 const examId = params.exam && params.exam !== "all" ? Number(params.exam) : null;
 const subject = params.subject && params.subject !== "all" ? params.subject : null;
 const campusLabel = campusId ? campuses.find((c) => c.branch_id === campusId)?.branch_name : null;
 const campusClause = campusLabel ? ` at ${campusLabel}` : "";

 // --- Passing rate (scoped by school year + campus) ---
 const base = { ...(cycle ? { cycle_id: cycle.cycle_id } : {}), ...(campusId ? { branch_id: campusId } : {}) };
 const [examined, passed] = await Promise.all([
  prisma.tbl_exam_result.count({ where: { tbl_application: base } }),
  prisma.tbl_exam_result.count({ where: { tbl_application: base, result_status: EXAM_RESULT_PASSED } }),
 ]);
 const courses = await Promise.all(programs.map(async (p) => {
  const [e, t] = await Promise.all([
   prisma.tbl_exam_result.count({ where: { tbl_application: { ...base, program_id: p.program_id } } }),
   prisma.tbl_exam_result.count({ where: { tbl_application: { ...base, program_id: p.program_id }, result_status: EXAM_RESULT_PASSED } }),
  ]);
  return { label: p.program_code, value: pct(t, e), examined: e };
 }));
 const coursesWithData = courses.filter((c) => c.examined > 0);
 // Show every course that had examinees (highest rate first), so the chart and the
 // insight agree — the weakest course is on the chart, not hidden behind a top-N cut.
 const shownCourses = coursesWithData.slice().sort((a, b) => b.value - a.value).slice(0, 12);

 // --- Item analysis (scoped by school year + exam + subject) ---
 const questions = await prisma.tbl_exam_question.findMany({
  where: { ...(examId ? { exam_id: examId } : cycle ? { tbl_exam: { cycle_id: cycle.cycle_id } } : {}), ...(subject ? { tbl_competency: { subject_area: subject } } : {}) },
  orderBy: { question_no: "asc" }, select: { question_id: true, question_no: true, tbl_competency: { select: { competency_name: true, subject_area: true } } },
 });
 const itemData = await Promise.all(questions.map(async (q) => {
  // Scope responses to the same school-year + campus cohort as the passing-rate side,
  // so the campus filter actually moves the item numbers (base is {} when "All").
  const responses = await prisma.tbl_question_response.findMany({ where: { question_id: q.question_id, tbl_exam_result: { tbl_application: base } }, select: { is_correct: true } });
  const correct = responses.filter((r) => r.is_correct).length;
  const percent = responses.length ? Math.round(correct / responses.length * 100) : 0;
  return { label: `Q${q.question_no}`, competency: q.tbl_competency?.competency_name ?? "General", percent, correct, total: responses.length };
 }));
 const subjects = [...new Set(competencies.map((c) => c.subject_area).filter((v): v is string => Boolean(v)))];
 // Only questions that were actually answered carry difficulty signal — a question
 // with no responses is not "hard", so it must not rank or chart as 0%.
 const answered = itemData.filter((q) => q.total > 0);
 // Answered questions go to the chart; it pages through them on the client (no reload).
 const chartItems = answered.map((q) => ({ label: q.label, value: q.correct }));
 const sorted = answered.slice().sort((a, b) => a.percent - b.percent);
 const hardest = sorted.slice(0, 4);
 const easiest = sorted.slice().reverse().slice(0, 4);

 // --- Insights ---
 const overallRate = pct(passed, examined);
 const bestCourse = shownCourses[0];
 const weakestCourse = shownCourses[shownCourses.length - 1];
 const courseGap = bestCourse && weakestCourse ? Math.round((bestCourse.value - weakestCourse.value) * 10) / 10 : 0;
 const avgCorrect = answered.length ? Math.round(answered.reduce((sum, q) => sum + q.percent, 0) / answered.length) : 0;
 const belowHalf = answered.filter((q) => q.percent < 50).length;
 const hardestQ = answered.slice().sort((a, b) => a.percent - b.percent)[0];
 const easiestQ = answered.slice().sort((a, b) => b.percent - a.percent)[0];
 const itemGap = hardestQ && easiestQ ? easiestQ.percent - hardestQ.percent : 0;
 // Weakest competency as a group — points to the area most worth reviewing.
 const competencyScores = new Map<string, { sum: number; count: number }>();
 for (const q of answered) {
  const entry = competencyScores.get(q.competency) ?? { sum: 0, count: 0 };
  entry.sum += q.percent; entry.count += 1;
  competencyScores.set(q.competency, entry);
 }
 const competencyAverages = [...competencyScores.entries()].map(([name, v]) => ({ name, avg: Math.round(v.sum / v.count), count: v.count })).sort((a, b) => a.avg - b.avg);
 const weakestCompetency = competencyAverages.length > 1 ? competencyAverages[0] : null;

 // Item-analysis-focused KPIs (passing rate / examinees live in the donut below,
 // and on the Overview page — these surface what only item analysis can tell you).
 const kpis = [
  { label: "Questions", value: itemData.length.toLocaleString(), note: `${answered.length.toLocaleString()} with responses${subject ? ` · ${subject}` : ""}` },
  { label: "Avg correct / item", value: answered.length ? `${avgCorrect}%` : "—", note: "chosen correctly, per item" },
  { label: "Hardest item", value: hardestQ ? hardestQ.label : "—", note: hardestQ ? `${hardestQ.percent}% answered it right` : "no responses yet" },
  { label: "Easiest item", value: easiestQ ? easiestQ.label : "—", note: easiestQ ? `${easiestQ.percent}% answered it right` : "no responses yet" },
 ];

 return <AnalyticsPage>
  <FilterBar action="/reports/item-analysis" exportHref={`/api/reports/item-analysis?cycle=${cycle?.cycle_id ?? ""}${campusId ? `&campus=${campusId}` : ""}${examId ? `&exam=${examId}` : ""}${subject ? `&subject=${encodeURIComponent(subject)}` : ""}`}>
   <SelectFilter name="cycle" label="School Year" value={cycle ? String(cycle.cycle_id) : ""} options={cycles.map((c) => ({ value: String(c.cycle_id), label: c.school_year }))} />
   <SelectFilter name="campus" label="Campus" value={campusId ? String(campusId) : "all"} options={[{ value: "all", label: "All" }, ...campuses.map((c) => ({ value: String(c.branch_id), label: c.branch_name }))]} />
   <SelectFilter name="exam" label="Exam" value={examId ? String(examId) : "all"} options={[{ value: "all", label: "All" }, ...exams.map((e) => ({ value: String(e.exam_id), label: e.exam_name }))]} />
   <SelectFilter name="subject" label="Subject" value={subject ?? "all"} options={[{ value: "all", label: "All" }, ...subjects.map((s) => ({ value: s, label: s }))]} />
  </FilterBar>

  <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
   {kpis.map((stat) => <div key={stat.label} className="rounded-xl border border-neutral-400 bg-white p-4"><p className="text-sm text-neutral-700">{stat.label}</p><p className="mt-1 text-3xl font-bold">{stat.value}</p><p className="text-xs text-neutral-500">{stat.note}</p></div>)}
  </div>

  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Passing rate</h2>
  <div className="grid gap-5 lg:grid-cols-2">
   <AnalyticsCard title="Overall result" className="flex flex-col">
    <div className="flex flex-1 items-center justify-center rounded-xl border border-neutral-500 p-4">
     <DonutChart passed={passed} failed={examined - passed} title="" size={220} />
    </div>
    {examined > 0
     ? <div className="mt-4"><Insight tone={overallRate >= 50 ? "positive" : "warning"}>{overallRate >= 50 ? `${passed.toLocaleString()} of ${examined.toLocaleString()} examinees cleared the cut-off — a ${overallRate}% pass rate${campusClause}.` : `Fewer than half passed${campusClause}: ${overallRate}% of ${examined.toLocaleString()} examinees, with ${(examined - passed).toLocaleString()} falling short of the cut-off.`}</Insight></div>
     : <p className="mt-4 text-center text-sm text-neutral-500">No exam results for this selection.</p>}
   </AnalyticsCard>
   <AnalyticsCard title="Passing rate by course (%)" className="flex flex-col">
    <div className="flex flex-1 flex-col justify-center rounded-xl border border-neutral-500 p-4">
     <HorizontalBars title="Passing rate by course (%)" items={shownCourses.length ? shownCourses : [{ label: "No course data", value: 0 }]} />
    </div>
    {bestCourse && weakestCourse && <div className="mt-4"><Insight>{bestCourse.label === weakestCourse.label ? `${bestCourse.label} is the only course with exam data so far, passing at ${bestCourse.value}%.` : `${bestCourse.label} passes at ${bestCourse.value}% while ${weakestCourse.label} manages ${weakestCourse.value}% — a ${courseGap}-point spread across ${shownCourses.length} courses.`}</Insight></div>}
   </AnalyticsCard>
  </div>

  <h2 className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wider text-neutral-500">Item analysis</h2>
  <div className="grid items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
   <AnalyticsCard title="Correct answers per question">
    {chartItems.length ? <PaginatedBars title="Correct answers per question" items={chartItems} /> : <div className="rounded-xl border border-neutral-500 p-3"><p className="py-16 text-center text-sm text-neutral-500">No question response data available.</p></div>}
    {answered.length > 0 && <div className="mt-4"><Insight>Examinees answered {avgCorrect}% of items correctly on average{belowHalf > 0 ? `, but ${belowHalf} of ${answered.length} items stumped more than half of them` : ` and cleared every item above 50%`}.{weakestCompetency ? ` Items under ${weakestCompetency.name} were hardest as a group (${weakestCompetency.avg}% avg).` : ""}</Insight></div>}
   </AnalyticsCard>
   <AnalyticsCard title="Hardest and easiest">
    <div className="space-y-5">
     {[{ title: "Hardest", rows: hardest }, { title: "Easiest", rows: easiest }].map((section) => <div key={section.title}><p className="mb-2 text-sm font-semibold text-neutral-800">{section.title}</p><div className={tableStyles.wrap}><table className="w-full border-collapse text-sm"><thead><tr className={tableStyles.headRow}><th className={tableStyles.th}>Question</th><th className={`${tableStyles.th} text-right`}>Correct</th><th className={`${tableStyles.th} text-right`}>Rate</th></tr></thead><tbody className={tableStyles.body}>{(section.rows.length ? section.rows : Array.from({ length: 4 }, (_, i) => ({ label: `Q${i + 1}`, percent: 0, correct: 0, total: 0 }))).map((row, index) => <tr key={`${section.title}-${row.label}-${index}`} className={tableStyles.row}><td className={`${tableStyles.td} font-medium`}>{row.label}</td><td className={`${tableStyles.td} text-right tabular-nums text-neutral-700`}>{row.correct}/{row.total}</td><td className={`${tableStyles.td} text-right`}><span className={`inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${row.percent >= 75 ? "bg-green-100 text-green-800" : row.percent >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{row.percent}%</span></td></tr>)}</tbody></table></div></div>)}
    </div>
    {hardestQ && easiestQ && <div className="mt-4"><Insight>{hardestQ.label === easiestQ.label ? `Only ${hardestQ.label} has responses so far (${hardestQ.percent}% correct).` : `${hardestQ.label}${hardestQ.competency !== "General" ? ` (${hardestQ.competency})` : ""} was toughest at ${hardestQ.percent}% correct — ${itemGap} points below the easiest, ${easiestQ.label} (${easiestQ.percent}%). Wide gaps can flag unclear wording or uneven coverage.`}</Insight></div>}
   </AnalyticsCard>
  </div>
 </AnalyticsPage>;
}
