import { Suspense } from "react";

import { requirePermission } from "@/lib/authorization";

async function CourseContent() {
  await requirePermission("course", "read");
  return null;
}

export default function CoursePage() {
  return (
    <Suspense fallback={null}>
      <CourseContent />
    </Suspense>
  );
}
