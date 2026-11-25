import { connection } from "next/server";

import ApplicantTable from "@/components/admission/applicant-table";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { getApplicantFormReferenceData } from "@/features/admission/applicant-form-data";
import { APPLICANT_BASE_PATH, APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { ACTIVE_APPLICANT, purgeExpiredArchivesSafely } from "@/features/admission/archive";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import type { ModuleName } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

const DESCRIPTION: Partial<Record<ModuleName, string>> = {
  admission: "Manage and view applicant information.",
  registrar: "View and update applicant information.",
  guidance: "View applicant information.",
};

/**
 * Applicants list shared by the Admission, Registrar and Guidance modules.
 * Access follows the module the page belongs to: Admission has full access
 * (including archive), Registrar can add and edit, Guidance can only view.
 */
export async function ApplicantsView({ module }: Readonly<{ module: "admission" | "registrar" | "guidance" }>) {
  await connection();
  const user = await requirePermission(module, "read");

  const canEdit =
    APPLICANT_EDIT_MODULES.includes(module) && (await hasPermission(user.role, module, "write"));
  const canArchive = module === "admission" && canEdit;
  // Applicants archived for over a year are permanently deleted.
  await purgeExpiredArchivesSafely();

  const [applicants, formData] = await Promise.all([
    prisma.tbl_applicant.findMany({
      where: ACTIVE_APPLICANT,
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      select: {
        applicant_id: true,
        first_name: true,
        middle_name: true,
        last_name: true,
        suffix: true,
        tbl_application: {
          orderBy: { application_date: "desc" },
          take: 1,
          select: {
            application_id: true,
            application_no: true,
            tbl_program: { select: { program_code: true, program_name: true } },
            tbl_school: { select: { school_name: true, school_type: true } },
            tbl_admission_stage: { select: { stage_name: true } },
          },
        },
      },
    }),
    // The add/edit modals need the form's dropdown data; only loaded for editors.
    canEdit
      ? Promise.all([
          getApplicantFormReferenceData(),
          prisma.tbl_admission_cycle.findFirst({
            where: { is_active: true },
            orderBy: { start_date: "desc" },
            select: { school_year: true },
          }),
        ])
      : Promise.resolve(null),
  ]);

  const rows = applicants.map((applicant) => {
    const application = applicant.tbl_application[0];
    return {
      applicant_id: applicant.applicant_id,
      application_id: application?.application_id ?? null,
      application_no: application?.application_no ?? null,
      name: [applicant.first_name, applicant.middle_name, applicant.last_name, applicant.suffix]
        .filter(Boolean)
        .join(" "),
      course_code: application?.tbl_program?.program_code ?? null,
      course_name: application?.tbl_program?.program_name ?? null,
      school_name: application?.tbl_school?.school_name ?? null,
      school_type: application?.tbl_school?.school_type ?? null,
      stage: application?.tbl_admission_stage?.stage_name ?? null,
    };
  });

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applicants</h1>
        <p className="text-sm text-neutral-700">{DESCRIPTION[module]}</p>
      </div>

      <ApplicantTable
        userId={user.id}
        applicants={rows}
        canEdit={canEdit}
        canArchive={canArchive}
        profileBase={APPLICANT_BASE_PATH[module]!}
        formData={
          formData ? { referenceData: formData[0], activeCycle: formData[1]?.school_year ?? null } : null
        }
      />
    </div>
  );
}
