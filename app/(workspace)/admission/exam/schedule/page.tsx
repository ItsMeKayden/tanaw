import { Suspense } from "react";

import { ExamScheduleView, type ExamScheduleSearchParams } from "@/components/admission/views/exam-schedule-view";
import { ExamScheduleSkeleton } from "@/components/ui/skeletons";

export default function ExamSchedulePage({ searchParams }: Readonly<{ searchParams: ExamScheduleSearchParams }>) {
  return (
    <Suspense fallback={<ExamScheduleSkeleton />}>
      <ExamScheduleView searchParams={searchParams} module="admission" />
    </Suspense>
  );
}
