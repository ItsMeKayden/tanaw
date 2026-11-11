import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function CoursePage() {
  await connection();

  await requirePermission("course", "read");

  return (
    <ModulePlaceholder
      title="Course Management"
      description="Manage academic programs, courses, and their associated information."
    />
  );
}
