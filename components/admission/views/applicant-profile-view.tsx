import { notFound } from "next/navigation";
import { connection } from "next/server";

import ApplicantProfile from "@/components/admission/applicant-profile";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { BackLink } from "@/components/ui/back-link";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { getApplicantProfile } from "@/features/admission/applicant-profile-query";
import { requirePermission } from "@/lib/authorization";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const BACK: Record<"admission" | "registrar" | "guidance", string> = {
  admission: "/admission",
  registrar: "/registrar/applicants",
  guidance: "/guidance/applicants",
};

/** Applicant profile shared by the Admission, Registrar and Guidance modules. */
export async function ApplicantProfileView({
  params,
  module,
}: Readonly<{ params: Promise<{ id: string }>; module: "admission" | "registrar" | "guidance" }>) {
  await connection();
  const user = await requirePermission(module, "read");

  const { id } = await params;
  const applicantId = Number(id);
  if (!Number.isSafeInteger(applicantId) || applicantId <= 0) notFound();

  const [applicant, stages, canEdit, canOpenEnrollment] = await Promise.all([
    getApplicantProfile(applicantId),
    prisma.tbl_admission_stage.findMany({
      orderBy: { stage_order: "asc" },
      select: { stage_id: true, stage_name: true },
    }),
    APPLICANT_EDIT_MODULES.includes(module) ? hasPermission(user.role, module, "write") : false,
    // Enrollment Verification belongs to the Admission and Registrar offices.
    hasAnyPermission(user.role, ["admission", "registrar"], "read"),
  ]);

  if (!applicant) notFound();

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <BackLink href={BACK[module]}>Back to Applicants</BackLink>

      <ApplicantProfile
        userId={user.id}
        applicant={applicant}
        stages={stages}
        canWrite={canEdit}
        showEnrollmentLink={canOpenEnrollment}
      />
    </div>
  );
}
