import { connection } from "next/server";

import { AnalyticsCard, AnalyticsPage, FilterBar, SelectFilter, VerticalBars } from "@/components/reports/analytics-ui";
import { resolveCycle } from "@/features/admission/admission-stats";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type PageProps=Readonly<{searchParams:Promise<{cycle?:string;exam?:string;subject?:string}>}>;

export default async function ItemAnalysisPage({searchParams}:PageProps){
 await connection(); await requirePermission("reports","read");
 const params=await searchParams; const {cycles,cycle}=await resolveCycle(params.cycle);
 const [exams,competencies]=await Promise.all([
  prisma.tbl_exam.findMany({where:{...(cycle?{cycle_id:cycle.cycle_id}:{})},orderBy:{exam_name:"asc"},select:{exam_id:true,exam_name:true}}),
  prisma.tbl_competency.findMany({orderBy:{competency_name:"asc"},select:{competency_id:true,competency_name:true,subject_area:true}}),
 ]);
 const examId=params.exam&&params.exam!=="all"?Number(params.exam):null;
 const subject=params.subject&&params.subject!=="all"?params.subject:null;
 const questions=await prisma.tbl_exam_question.findMany({
  where:{...(examId?{exam_id:examId}:cycle?{tbl_exam:{cycle_id:cycle.cycle_id}}:{}),...(subject?{tbl_competency:{subject_area:subject}}:{})},
  orderBy:{question_no:"asc"},select:{question_id:true,question_no:true,tbl_competency:{select:{competency_name:true,subject_area:true}}},
 });
 const itemData=await Promise.all(questions.map(async(q)=>{
  const responses=await prisma.tbl_question_response.findMany({where:{question_id:q.question_id},select:{is_correct:true}});
  const correct=responses.filter((r)=>r.is_correct).length;
  const percent=responses.length?Math.round(correct/responses.length*100):0;
  return {label:`Q${q.question_no}`,competency:q.tbl_competency?.competency_name??"General",percent,correct,total:responses.length};
 }));
 const subjects=[...new Set(competencies.map((c)=>c.subject_area).filter((v):v is string=>Boolean(v)))];
 const chartItems=itemData.slice(0,12).map((q)=>({label:q.label,value:q.correct}));
 const sorted=itemData.slice().sort((a,b)=>a.percent-b.percent);
 const hardest=sorted.slice(0,4);
 const easiest=sorted.slice().reverse().slice(0,4);

 return <AnalyticsPage>
  <FilterBar action="/reports/item-analysis">
   <SelectFilter name="cycle" label="School Year" value={cycle?String(cycle.cycle_id):""} options={cycles.map((c)=>({value:String(c.cycle_id),label:c.school_year}))}/>
   <SelectFilter name="exam" label="Exam set" value={examId?String(examId):"all"} options={[{value:"all",label:"All"},...exams.map((e)=>({value:String(e.exam_id),label:e.exam_name}))]}/>
   <SelectFilter name="subject" label="Subject" value={subject??"all"} options={[{value:"all",label:"All"},...subjects.map((s)=>({value:s,label:s}))]}/>
  </FilterBar>
  <div className="grid items-start gap-5 lg:grid-cols-2">
   <AnalyticsCard title="Correct answer per question">
    <div className="rounded-xl border border-neutral-500 p-3">
     {chartItems.length?<VerticalBars title="Correct answer per question" items={chartItems.map((item)=>({label:item.label,publicValue:item.value,privateValue:0}))}/>:<p className="py-16 text-center text-sm text-neutral-500">No question response data available.</p>}
    </div>
   </AnalyticsCard>
   <AnalyticsCard title="Hardest and easiest">
    <div className="space-y-5">
     {[{title:"Hardest",rows:hardest},{title:"Easiest",rows:easiest}].map((section)=><div key={section.title}><p className="mb-1 text-center text-sm text-neutral-600">{section.title}</p><table className="w-full border-collapse text-sm"><thead><tr className="bg-[#cfd4f3]"><th className="border border-neutral-600 px-2 py-2">Q</th><th className="border border-neutral-600 px-2 py-2">Correct</th><th className="border border-neutral-600 px-2 py-2">%</th></tr></thead><tbody>{(section.rows.length?section.rows:Array.from({length:4},(_,i)=>({label:`Q${i+1}`,percent:0,correct:0,total:0}))).map((row,index)=><tr key={`${section.title}-${row.label}-${index}`}><td className="border border-neutral-400 px-2 py-2">{row.label}</td><td className="border border-neutral-400 px-2 py-2 text-center">{row.correct}/{row.total}</td><td className="border border-neutral-400 px-2 py-2 text-center">{row.percent}%</td></tr>)}</tbody></table></div>)}
    </div>
   </AnalyticsCard>
  </div>
 </AnalyticsPage>
}
