import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function DashboardPage() {
  await connection();

  await requirePermission("dashboard", "read");

  return (
    <ModulePlaceholder
      title="Dashboard"
      description="View an overview of institutional activities, key statistics, and important updates."
    />
  );
}
