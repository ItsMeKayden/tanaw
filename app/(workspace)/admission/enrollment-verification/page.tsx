import { connection } from "next/server";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requirePermission } from "@/lib/authorization";

export default async function EnrollmentVerificationPage() {
  await connection();

  await requirePermission("admission", "read");

  return (
    <ModulePlaceholder
      title="Enrollment Verification"
      description="Verify and monitor the enrollment status of qualified applicants."
    />
  );
}
