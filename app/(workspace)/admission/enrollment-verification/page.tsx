import { Suspense } from "react";
import { connection } from "next/server";
import { BadgeCheck, Hourglass, UserCheck } from "lucide-react";

import EnrollmentVerificationTable from "@/components/admission/enrollment-verification-table";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { StatCard } from "@/components/ui/stat-card";
import { getAdmittedApplications } from "@/features/admission/enrollment-queries";
import { requireAnyPermission } from "@/lib/authorization";
import { TablePageSkeleton } from "@/components/ui/skeletons";

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

async function EnrollmentVerificationContent() {
  await connection();
  await requireAnyPermission(["admission", "registrar"], "read");

  const rows = await getAdmittedApplications();

  const total = rows.length;
  const enrolled = rows.filter((row) => row.status === "ENROLLED").length;
  const notYet = total - enrolled;

  const stats = [
    { label: "Passed applicants", value: total, note: null, icon: UserCheck, tone: "primary" },
    {
      label: "Verified enrolled",
      value: enrolled,
      note: `${percent(enrolled, total)}% of passed`,
      icon: BadgeCheck,
      tone: "success",
    },
    {
      label: "Not yet enrolled",
      value: notYet,
      note: `${percent(notYet, total)}% of passed`,
      icon: Hourglass,
      tone: "warning",
    },
  ] as const;

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <h1 className="sr-only">Enrollment Verification</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <EnrollmentVerificationTable rows={rows} />
    </div>
  );
}

export default function EnrollmentVerificationPage() {
  return (
    <Suspense fallback={<TablePageSkeleton label="enrollment verification" stats={3} cols={7} />}>
      <EnrollmentVerificationContent />
    </Suspense>
  );
}
