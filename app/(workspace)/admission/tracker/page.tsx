import { Suspense } from "react";
import { connection } from "next/server";
import { requirePermission } from "@/lib/authorization";
import { OverviewSkeleton } from "@/components/ui/skeletons";

async function AdmissionTrackerPageContent() {
  await connection();

  await requirePermission("admission", "read");

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Admission Tracker</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Monitor applicants and track their admission progress.
      </p>
    </main>
  );
}

export default function AdmissionTrackerPage() {
  return (
    <Suspense fallback={<OverviewSkeleton label="admission tracker" />}>
      <AdmissionTrackerPageContent />
    </Suspense>
  );
}
