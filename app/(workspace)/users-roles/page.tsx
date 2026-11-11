import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function UsersRolesPage() {
  await connection();

  await requirePermission("users", "read");

  return (
    <ModulePlaceholder
      title="User Access and Roles"
      description="Manage system users, account access, and role-based permissions."
    />
  );
}
