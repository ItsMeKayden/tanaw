import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";

async function UsersRolesContent() {
  await requirePermission("users", "read");
  return null;
}

export default function UsersRolesPage() {
  return (
    <Suspense fallback={null}>
      <UsersRolesContent />
    </Suspense>
  );
}
