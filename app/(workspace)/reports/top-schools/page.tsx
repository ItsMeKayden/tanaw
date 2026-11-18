import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, FilterBar, SelectFilter } from "@/components/reports/analytics-ui";
import { resolveCycle } from "@/features/admission/admission-stats";
import { EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type PageProps=Readonly<{searchParams:Promise<{cycle?:string;type?:string}>}>;

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

 return <AnalyticsPage>
  <FilterBar action="/reports/top-schools">
   <div className="flex rounded-full border border-neutral-500 p-1">
    {[{v:"all",l:"All"},{v:"Public",l:"Public"},{v:"Private",l:"Private"}].map((item)=><a key={item.v} href={`/reports/top-schools?type=${item.v}${cycle?`&cycle=${cycle.cycle_id}`:""}`} className={`rounded-full px-5 py-1.5 text-sm ${params.type===item.v||(item.v==="all"&&!params.type)?"bg-[#191e73] text-white":"bg-transparent"}`}>{item.l}</a>)}
   </div>
   <div className="ml-auto"><SelectFilter name="cycle" label="School Year" value={cycle?String(cycle.cycle_id):""} options={cycles.map((c)=>({value:String(c.cycle_id),label:c.school_year}))}/></div>
  </FilterBar>
  <div className="grid gap-5 lg:grid-cols-2">
   <AnalyticsCard title="Most applicants">
    <div className="space-y-2">{(most.length?most:[{school_name:"No applicant data",applicants:0}]).map((row,index)=><div key={`${row.school_name}-${index}`} className="rounded-sm bg-[#dde1f6] px-3 py-3 text-sm">{row.school_name} - [{row.applicants} applicant{row.applicants===1?"":"s"}]</div>)}</div>
   </AnalyticsCard>
   <AnalyticsCard title="Most successful examiners">
    <div className="space-y-2">{(successful.length?successful:[{school_name:"No successful examiner data",passed:0}]).map((row,index)=><div key={`${row.school_name}-${index}`} className="rounded-sm bg-[#dde1f6] px-3 py-3 text-sm">{row.school_name} - [{row.passed} successful examiner{row.passed===1?"":"s"}]</div>)}</div>
   </AnalyticsCard>
  </div>
 </AnalyticsPage>
}
