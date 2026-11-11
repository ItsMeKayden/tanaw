import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function MapPage() {
  await connection();

  await requirePermission("map", "read");

  return (
    <ModulePlaceholder
      title="Campus Map"
      description="View campus locations, facilities, and geographic information."
    />
  );
}
