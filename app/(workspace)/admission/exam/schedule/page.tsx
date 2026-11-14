import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function ExamSchedulePage() {
  await connection();

  await requirePermission("admission", "read");

  return (
    <ModulePlaceholder
      title="Exam Schedule"
      description="Manage and view scheduled admission examinations."
    />
  );
}
