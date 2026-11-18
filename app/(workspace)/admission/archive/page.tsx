import { Suspense } from "react";
import { connection } from "next/server";

import ArchiveTable from "@/components/admission/archive-table";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import {
  ARCHIVE_RETENTION_DAYS,
  getArchivedApplicants,
  purgeExpiredArchivesSafely,
} from "@/features/admission/archive";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { TablePageSkeleton } from "@/components/ui/skeletons";

async function ArchiveContent() {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  // Records past the one-year retention are deleted before listing.
  await purgeExpiredArchivesSafely();

  const rows = await getArchivedApplicants();

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Archive History</h1>
        <p className="text-sm text-neutral-700">
          Archived applicants are hidden from every list, report, and map. Recover a record to restore it with all
          of its applications, exam results, and documents. Records not recovered within{" "}
          {ARCHIVE_RETENTION_DAYS} days (one year) are deleted permanently.
        </p>
      </div>

      <ArchiveTable rows={rows} canWrite={canWrite} />
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<TablePageSkeleton label="archive history" cols={8} />}>
      <ArchiveContent />
    </Suspense>
  );
}
