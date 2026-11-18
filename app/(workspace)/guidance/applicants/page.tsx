import { Suspense } from "react";

import { ApplicantsView } from "@/components/admission/views/applicants-view";
import { TablePageSkeleton } from "@/components/ui/skeletons";

export default function GuidanceApplicantsPage() {
  return (
    <Suspense fallback={<TablePageSkeleton label="applicants" cols={7} />}>
      <ApplicantsView module="guidance" />
    </Suspense>
  );
}
