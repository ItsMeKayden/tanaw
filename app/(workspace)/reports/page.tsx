import { Suspense } from "react";
import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";
import { OverviewSkeleton } from "@/components/ui/skeletons";

async function ReportsPageContent() {
  await connection();

  await requirePermission("reports", "read");

  return (
    <ModulePlaceholder
      title="Analytics"
      description="View institutional analytics, reports, and admission statistics."
    />
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<OverviewSkeleton label="analytics" />}>
      <ReportsPageContent />
    </Suspense>
  );
}
