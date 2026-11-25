import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, FilterBar, Insight, PieChart, SelectFilter } from "@/components/reports/analytics-ui";
import { tableStyles } from "@/components/ui/table-styles";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type PageProps=Readonly<{searchParams:Promise<{cycle?:string;type?:string}>}>;

const RANK_BADGES = ["bg-[#191e73] text-white", "bg-[#3a41a8] text-white", "bg-[#6b71c9] text-white"];

// CVD-safe categorical hues (validated) for the top-5 slices; Others stays neutral gray.
const PIE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHERS_COLOR = "#9ca3af";

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Ranked schools with a bar showing each count against the top one. */
function RankTable({ rows, unit, empty }: Readonly<{ rows: { name: string; value: number }[]; unit: string; empty: string }>) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className={tableStyles.wrap}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={tableStyles.headRow}>
            <th className={`${tableStyles.th} w-14`}>Rank</th>
            <th className={tableStyles.th}>School</th>
            <th className={`${tableStyles.th} w-28 text-right`}>{unit}</th>
          </tr>
        </thead>
        <tbody className={tableStyles.body}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className={tableStyles.empty}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className={tableStyles.row}>
                <td className={tableStyles.td}>
                  <span
                    className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                      RANK_BADGES[index] ?? "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {index + 1}
                  </span>
                </td>
                <td className={tableStyles.td}>
                  <span className="block font-medium text-neutral-900">{row.name}</span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-[#191e73]/70"
                      style={{ width: `${(row.value / max) * 100}%` }}
                    />
                  </span>
                </td>
                <td className={`${tableStyles.td} text-right text-base font-semibold tabular-nums`}>
                  {row.value.toLocaleString("en-US")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function TopSchoolsPage({searchParams}:PageProps){
 await connection(); await requirePermission("reports","read");
 const params=await searchParams; const {cycles,cycle}=await resolveCycle(params.cycle);
 const type=params.type&&params.type!=="all"?params.type:null;
 const schools=await prisma.tbl_school.findMany({
  where:{...(type?{school_type:type}:{}),tbl_application:{some:{...(cycle?{cycle_id:cycle.cycle_id}:{})}}},
  select:{school_id:true,school_name:true},orderBy:{school_name:"asc"},
 });
 const ranked=await Promise.all(schools.map(async(s)=>{
  const [applicants,passed]=await Promise.all([
   prisma.tbl_application.count({where:{school_id:s.school_id,...(cycle?{cycle_id:cycle.cycle_id}:{})}}),
   prisma.tbl_application.count({where:{school_id:s.school_id,...(cycle?{cycle_id:cycle.cycle_id}:{}),tbl_exam_result:{some:{result_status:EXAM_RESULT_PASSED}}}}),
  ]);
  return {...s,applicants,passed};
 }));
 const most=ranked.slice().sort((a,b)=>b.applicants-a.applicants).slice(0,6);
 const successful=ranked.slice().sort((a,b)=>b.passed-a.passed).slice(0,6);

 // Pie: share of passers held by the top 5 schools, with the rest folded into "Others".
 const passedRanked=ranked.filter((s)=>s.passed>0).sort((a,b)=>b.passed-a.passed);
 const totalPassed=passedRanked.reduce((sum,s)=>sum+s.passed,0);
 const topPassed=passedRanked.slice(0,5);
 const othersPassed=passedRanked.slice(5).reduce((sum,s)=>sum+s.passed,0);
 const othersCount=Math.max(0,passedRanked.length-5);
 const pieItems=[
  ...topPassed.map((s,index)=>({label:s.school_name,value:s.passed,color:PIE_COLORS[index]})),
  ...(othersPassed>0?[{label:`Others (${othersCount} ${othersCount===1?"school":"schools"})`,value:othersPassed,color:OTHERS_COLOR}]:[]),
 ];
 const top5Share=pct(topPassed.reduce((sum,s)=>sum+s.passed,0),totalPassed);
 const topApplicantSchool=most.find((s)=>s.applicants>0);
 const totalApplicants=ranked.reduce((sum,s)=>sum+s.applicants,0);
 const scopeLabel=type?`${type.toLowerCase()} schools`:"schools";

 return <AnalyticsPage>
  <FilterBar action="/reports/top-schools">
   <input type="hidden" name="type" value={type ?? "all"} />
   <div className="flex rounded-full border border-neutral-500 p-1">
    {[{v:"all",l:"All"},{v:"Public",l:"Public"},{v:"Private",l:"Private"}].map((item)=><a key={item.v} href={`/reports/top-schools?type=${item.v}${cycle?`&cycle=${cycle.cycle_id}`:""}`} className={`rounded-full px-5 py-1.5 text-sm ${params.type===item.v||(item.v==="all"&&!params.type)?"bg-[#191e73] text-white":"bg-transparent"}`}>{item.l}</a>)}
   </div>
   <div className="ml-auto"><SelectFilter name="cycle" label="School Year" value={cycle?String(cycle.cycle_id):""} options={cycles.map((c)=>({value:String(c.cycle_id),label:c.school_year}))}/></div>
  </FilterBar>
  <div className="grid items-start gap-5 lg:grid-cols-2">
   <AnalyticsCard title="Most applicants">
    <RankTable unit="Applicants" empty="No applicant data yet." rows={most.map((row)=>({name:row.school_name,value:row.applicants}))}/>
    {topApplicantSchool&&<div className="mt-3"><Insight>{topApplicantSchool.school_name} sends the most applicants ({topApplicantSchool.applicants.toLocaleString("en-US")}), about {pct(topApplicantSchool.applicants,totalApplicants)}% of all applicants across {scopeLabel} this school year.</Insight></div>}
   </AnalyticsCard>
   <AnalyticsCard title="Most successful examiners">
    <RankTable unit="Passed" empty="No successful examiner data yet." rows={successful.filter((row)=>row.passed>0).map((row)=>({name:row.school_name,value:row.passed}))}/>
    {passedRanked.length>0&&<div className="mt-3"><Insight tone="positive">{passedRanked[0].school_name} leads on passers ({passedRanked[0].passed.toLocaleString("en-US")}){passedRanked[0].applicants>0?`, a ${pct(passedRanked[0].passed,passedRanked[0].applicants)}% pass rate for its applicants`:""}.</Insight></div>}
   </AnalyticsCard>
  </div>
  <div className="mt-5">
   <AnalyticsCard title="Share of passers — top 5 schools">
    <PieChart title="Passers by school (top 5 + Others)" unit="passers" empty="No passer data yet." items={pieItems}/>
    {totalPassed>0&&<div className="mt-4"><Insight>{othersCount>0?`The top 5 ${scopeLabel} account for ${top5Share}% of all passers; the remaining ${othersCount} ${othersCount===1?"school contributes":"schools contribute"} the other ${pct(othersPassed,totalPassed)}%.${top5Share>=60?" Passers cluster in a few feeder schools — a clear focus for outreach.":""}`:`All ${totalPassed.toLocaleString("en-US")} passers come from just ${passedRanked.length} ${passedRanked.length===1?"school":"schools"} this school year.`}</Insight></div>}
   </AnalyticsCard>
  </div>
 </AnalyticsPage>
}
