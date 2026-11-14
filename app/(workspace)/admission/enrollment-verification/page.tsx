import { Suspense } from "react";
import { connection } from "next/server";

import EnrollmentVerificationTable from "@/components/admission/enrollment-verification-table";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { getAdmittedApplications } from "@/features/admission/enrollment-queries";
import { requireAnyPermission } from "@/lib/authorization";

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
    { label: "Passed applicants", value: total, note: null },
    {
      label: "Verified enrolled",
      value: enrolled,
      note: `${percent(enrolled, total)}% of passed`,
    },
    {
      label: "Not yet enrolled",
      value: notYet,
      note: `${percent(notYet, total)}% of passed`,
    },
  ];

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <h1 className="sr-only">Enrollment Verification</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-neutral-500 bg-white/90 p-4"
          >
            <p className="text-sm text-neutral-800">{stat.label}</p>
            <p className="text-3xl font-semibold">{stat.value}</p>
            {stat.note && <p className="text-xs text-neutral-600">{stat.note}</p>}
          </div>
        ))}
      </div>

      <EnrollmentVerificationTable rows={rows} />
    </div>
  );
}

export default function EnrollmentVerificationPage() {
  return (
    <Suspense fallback={null}>
      <EnrollmentVerificationContent />
    </Suspense>
  );
}
