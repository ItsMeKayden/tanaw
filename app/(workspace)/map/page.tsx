import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";

async function MapContent() {
  await requirePermission("map", "read");
  return null;
}

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapContent />
    </Suspense>
  );
}
