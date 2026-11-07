import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";

async function AdmissionContent() {
  const user = await requirePermission("admission", "read");

  return (
    <div className="p-3">
      <p>Welcome, {user.name ?? user.email}!</p>
      <p className="mt-1 text-sm text-muted-foreground">Role: {user.role}</p>
    </div>
  );
}

export default function AdmissionPage() {
  return (
    <Suspense fallback={null}>
      <AdmissionContent />
    </Suspense>
  );
}
