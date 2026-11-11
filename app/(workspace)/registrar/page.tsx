import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function RegistrarPage() {
  await connection();

  await requirePermission("registrar", "read");

  return (
    <ModulePlaceholder
      title="Registrar Management"
      description="Manage student records, academic information, and registrar transactions."
    />
  );
}
