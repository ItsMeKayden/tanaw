import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function ReportsPage() {
  await connection();

  await requirePermission("reports", "read");

  return (
    <ModulePlaceholder
      title="Analytics"
      description="View institutional analytics, reports, and admission statistics."
    />
  );
}
