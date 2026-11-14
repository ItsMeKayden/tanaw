import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function GuidancePage() {
  await connection();

  await requirePermission("guidance", "read");

  return (
    <ModulePlaceholder
      title="Guidance Management"
      description="Manage student guidance services, counseling records, and student support activities."
    />
  );
}
