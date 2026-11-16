import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import ApplicantProfile from "@/components/admission/applicant-profile";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getApplicantProfile } from "@/features/admission/applicant-profile-query";
import { BackLink } from "@/components/ui/back-link";

type ApplicantPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;


async function ApplicantProfileContent({ params }: ApplicantPageProps) {
  await connection();
  const user = await requirePermission("admission", "read");

  const { id } = await params;
  const applicantId = Number(id);

  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
    notFound();
  }

  const [applicant, stages, canWrite] = await Promise.all([
    getApplicantProfile(applicantId),
    prisma.tbl_admission_stage.findMany({
      orderBy: { stage_order: "asc" },
      select: { stage_id: true, stage_name: true },
    }),
    hasPermission(user.role, "admission", "write"),
  ]);

  if (!applicant) {
    notFound();
  }

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <BackLink href="/admission">Back to Applicants</BackLink>

      <ApplicantProfile
        applicant={applicant}
        stages={stages}
        canWrite={canWrite}
      />
    </div>
  );
}

export default function ApplicantProfilePage({ params }: ApplicantPageProps) {
  return (
    <Suspense fallback={null}>
      <ApplicantProfileContent params={params} />
    </Suspense>
  );
}
