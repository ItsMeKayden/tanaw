import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";

async function RegistrarContent() {
  const user = await requirePermission("registrar", "read");

  return (
    <div className="p-3">
      <p>Welcome, {user.name ?? user.email}!</p>
      <p className="mt-1 text-sm text-muted-foreground">Role: {user.role}</p>
    </div>
  );
}

export default function RegistrarPage() {
  return (
    <Suspense fallback={null}>
      <RegistrarContent />
    </Suspense>
  );
}
