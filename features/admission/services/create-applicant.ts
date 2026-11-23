import { revalidatePath } from "next/cache";

import { getAccountId } from "@/lib/authorization";
import { APPLICANT_LIST_PATHS } from "@/features/admission/access";
import { prisma } from "@/lib/prisma";
import {
  assertReferencesExist,
  parseApplicantForm,
  resolveSchoolId,
  saveApplicationDocuments,
  type ApplicantActionError,
} from "@/features/admission/applicant-form.server";
import { ADMISSION_STAGES } from "@/features/admission/stages";

function getManilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

export async function createApplicantForUser(
  formData: FormData,
  user: { id?: string | null },
): Promise<{ success: true; applicantId: number } | ApplicantActionError> {
  const parsed = await parseApplicantForm(formData);
  if ("error" in parsed) return parsed;

  const { applicant, application, school, documents } = parsed.data;
  const prefix = `TANAW-${getManilaDate().getUTCFullYear()}-`;

  try {
    const accountId = getAccountId(user);

    const applicantId = await prisma.$transaction(async (tx) => {
      await assertReferencesExist(tx, application);

      const [cycle, stage] = await Promise.all([
        tx.tbl_admission_cycle.findFirst({
          where: { is_active: true },
          orderBy: { start_date: "desc" },
          select: { cycle_id: true },
        }),
        tx.tbl_admission_stage.findFirst({
          where: { stage_name: ADMISSION_STAGES.APPLICATION_SUBMITTED },
          select: { stage_id: true },
        }),
      ]);

      if (!cycle) throw new Error("There is no active admission cycle.");
      if (!stage) throw new Error('The "Application Submitted" stage is missing.');

      const schoolId = await resolveSchoolId(tx, school);
      const latestApplication = await tx.tbl_application.findFirst({
        where: { application_no: { startsWith: prefix } },
        orderBy: { application_no: "desc" },
        select: { application_no: true },
      });

      const lastSequence = latestApplication
        ? Number(latestApplication.application_no.slice(prefix.length))
        : 0;
      const created = await tx.tbl_applicant.create({
        data: applicant,
        select: { applicant_id: true },
      });
      const createdApplication = await tx.tbl_application.create({
        data: {
          ...application,
          applicant_id: created.applicant_id,
          school_id: schoolId,
          cycle_id: cycle.cycle_id,
          current_stage_id: stage.stage_id,
          application_no: `${prefix}${String(lastSequence + 1).padStart(4, "0")}`,
          application_date: getManilaDate(),
        },
        select: { application_id: true },
      });

      await tx.tbl_application_stage_log.create({
        data: {
          application_id: createdApplication.application_id,
          stage_id: stage.stage_id,
          changed_by: accountId,
          remarks: "Application created.",
        },
      });
      await saveApplicationDocuments(
        tx,
        createdApplication.application_id,
        accountId,
        documents,
        [],
      );
      return created.applicant_id;
    });

    for (const path of APPLICANT_LIST_PATHS) revalidatePath(path);
    return { success: true, applicantId };
  } catch (error) {
    console.error("Create applicant error:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the applicant.",
    };
  }
}
