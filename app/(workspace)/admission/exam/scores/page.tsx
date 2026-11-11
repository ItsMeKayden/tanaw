import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function ExamScoresPage() {
  await connection();

  await requirePermission("admission", "read");

  return (
    <ModulePlaceholder
      title="Exam Scores"
      description="View and manage applicants' admission examination scores and results."
    />
  );
}
