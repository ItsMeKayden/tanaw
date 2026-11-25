import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, DonutChart, FilterBar, HorizontalBars, SelectFilter } from "@/components/reports/analytics-ui";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function pct(part:number, whole:number){return whole?Math.round(part/whole*1000)/10:0}
type PageProps=Readonly<{searchParams:Promise<{cycle?:string;campus?:string}>}>;

export default async function PassingRatePage({searchParams}:PageProps){
 await connection(); await requirePermission("reports","read");
 const params=await searchParams; const {cycles,cycle}=await resolveCycle(params.cycle);
 const campusId=params.campus&&params.campus!=="all"?Number(params.campus):null;
 const [campuses,programs]=await Promise.all([
  prisma.tbl_branch.findMany({orderBy:{branch_name:"asc"},select:{branch_id:true,branch_name:true}}),
  prisma.tbl_program.findMany({orderBy:{program_code:"asc"},select:{program_id:true,program_code:true}}),
 ]);
 const base={...(cycle?{cycle_id:cycle.cycle_id}:{}),...(campusId?{branch_id:campusId}:{})};
 const [examined,passed]=await Promise.all([
  prisma.tbl_exam_result.count({where:{tbl_application:base}}),
  prisma.tbl_exam_result.count({where:{tbl_application:base,result_status:EXAM_RESULT_PASSED}}),
 ]);
 const courses=await Promise.all(programs.map(async(p)=>{
  const [e,t]=await Promise.all([
   prisma.tbl_exam_result.count({where:{tbl_application:{...base,program_id:p.program_id}}}),
   prisma.tbl_exam_result.count({where:{tbl_application:{...base,program_id:p.program_id},result_status:EXAM_RESULT_PASSED}}),
  ]);
  return {label:p.program_code,value:pct(t,e),examined:e};
 }));
 const populated=courses.filter((c)=>c.examined>0).sort((a,b)=>b.value-a.value).slice(0,6);

 return <AnalyticsPage>
  <FilterBar action="/reports/passing-rate" exportHref={`/api/reports/passing-rate?cycle=${cycle?.cycle_id ?? ""}${campusId ? `&campus=${campusId}` : ""}`}>
   <SelectFilter name="cycle" label="School Year" value={cycle?String(cycle.cycle_id):""} options={cycles.map((c)=>({value:String(c.cycle_id),label:c.school_year}))}/>
   <SelectFilter name="campus" label="Campus" value={campusId?String(campusId):"all"} options={[{value:"all",label:"All"},...campuses.map((c)=>({value:String(c.branch_id),label:c.branch_name}))]}/>
  </FilterBar>
  <div className="grid gap-5 lg:grid-cols-2">
   <AnalyticsCard title="Overall result">
    <div className="rounded-xl border border-neutral-500 p-4">
     <p className="mb-2 text-sm font-medium">Overall result</p>
     <DonutChart passed={passed} failed={examined-passed} title=""/>
    </div>
    <p className="mt-4 text-center text-lg font-semibold">{pct(passed,examined)}% passed ({passed} of {examined})</p>
   </AnalyticsCard>
   <AnalyticsCard title="Passing rate by course (%)">
    <div className="mt-5 rounded-xl border border-neutral-500 p-4">
     <HorizontalBars title="Passing rate by course (%)" items={populated.length?populated:[{label:"No course data",value:0}]}/>
    </div>
   </AnalyticsCard>
  </div>
 </AnalyticsPage>
}
