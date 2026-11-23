import { Suspense } from "react";
import { connection } from "next/server";

import { AdditionalApplicants } from "@/components/admission/additional-applicants";
import { FilterSelect } from "@/components/admission/filter-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { TablePageSkeleton } from "@/components/ui/skeletons";
import { getAdditionalApplicantsData } from "@/features/admission/additional-applicants";
import { resolveCycle } from "@/features/admission/admission-stats";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[] }>;
}>;

async function AdditionalApplicantsContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const { cycles, cycle } = await resolveCycle((await searchParams).cycle);

  if (!cycle) {
    return (
      <div className="relative isolate min-h-full p-4 sm:p-6">
        <QcuWatermark />
        <h1 className="sr-only">Additional applicants</h1>
        <p className="rounded-xl border border-neutral-300 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      </div>
    );
  }

  const { applicants, quotas, courseCodes } = await getAdditionalApplicantsData(cycle.cycle_id);

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Additional Applicants</h1>
        <p className="text-sm text-neutral-700">
          Applicants who passed the exam after their course&apos;s quota was full wait here as{" "}
          <span className="font-medium">Qualified</span>. When slots open up — for example when an admitted applicant
          is marked Not Enrolled — admit the next ones as an additional batch.
        </p>
      </div>

      <AdditionalApplicants
        key={cycle.cycle_id}
        cycleId={cycle.cycle_id}
        applicants={applicants}
        quotas={quotas}
        courseCodes={courseCodes}
        canWrite={canWrite}
        schoolYearSelect={
          <FilterSelect
            key="school-year"
            param="cycle"
            label="School year"
            value={String(cycle.cycle_id)}
            options={cycles.map((c) => ({ value: String(c.cycle_id), label: `S.Y. ${c.school_year}` }))}
          />
        }
      />
    </div>
  );
}

export default function AdditionalApplicantsPage(props: PageProps) {
  return (
    <Suspense fallback={<TablePageSkeleton label="additional applicants" stats={3} cols={6} />}>
      <AdditionalApplicantsContent {...props} />
    </Suspense>
  );
}
