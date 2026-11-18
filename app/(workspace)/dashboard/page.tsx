import { Suspense } from "react";
import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";
import { OverviewSkeleton } from "@/components/ui/skeletons";

async function DashboardPageContent() {
  await connection();

  await requirePermission("dashboard", "read");

  return (
    <ModulePlaceholder
      title="Dashboard"
      description="View an overview of institutional activities, key statistics, and important updates."
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<OverviewSkeleton label="dashboard" />}>
      <DashboardPageContent />
    </Suspense>
  );
}
