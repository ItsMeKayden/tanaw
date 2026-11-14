"use server";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type CreateApplicantInput = {
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  sex: string;
  birth_date: string;
  email: string;
  mobile_no: string;
  district_id: string;
  barangay_id: string;
  branch_id: string;
  program_id: string;
  school_id: string;
  new_school_name: string;
  new_school_type: string;
  new_school_city: string;
  school_entry_mode: "existing" | "new";
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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

export async function createApplicant(input: CreateApplicantInput) {
  await requirePermission("admission", "write");

  const lastName = input.last_name.trim();
  const firstName = input.first_name.trim();
  const suffix = input.suffix.trim();

  if (suffix.length > 20) {
    return { error: "Suffix must not exceed 20 characters." };
  }
  const birthDate = new Date(`${input.birth_date}T00:00:00.000Z`);

  const districtId = parseId(input.district_id);
  const barangayId = parseId(input.barangay_id);
  const branchId = parseId(input.branch_id);
  const programId = parseId(input.program_id);

  if (!lastName || !firstName || !input.birth_date || !input.sex) {
    return { error: "Please complete all required personal information." };
  }

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== input.birth_date
  ) {
    return { error: "Please provide a valid birth date." };
  }

  if (!["Male", "Female"].includes(input.sex)) {
    return { error: "Please select a valid sex." };
  }

  if (!districtId || !barangayId || !branchId || !programId) {
    return {
      error: "Please select a valid district, barangay, campus, and program.",
    };
  }

  if (
    input.school_entry_mode !== "existing" &&
    input.school_entry_mode !== "new"
  ) {
    return { error: "Please select a valid school entry method." };
  }

  if (
    input.school_entry_mode === "new" &&
    (!input.new_school_name.trim() ||
      !input.new_school_type.trim() ||
      !input.new_school_city.trim())
  ) {
    return { error: "Please complete all new school information." };
  }

  const currentYear = getManilaDate().getUTCFullYear();
  const prefix = `TANAW-${currentYear}-`;

  try {
    const applicantId = await prisma.$transaction(async (tx) => {
      const [barangay, branch, program, cycle, stage] = await Promise.all([
        tx.tbl_barangay.findFirst({
          where: {
            barangay_id: barangayId,
            district_id: districtId,
          },
          select: { barangay_id: true },
        }),
        tx.tbl_branch.findFirst({
          where: { branch_id: branchId, is_active: true },
          select: { branch_id: true },
        }),
        tx.tbl_program.findFirst({
          where: { program_id: programId, is_active: true },
          select: { program_id: true },
        }),
        tx.tbl_admission_cycle.findFirst({
          where: { is_active: true },
          orderBy: { start_date: "desc" },
          select: { cycle_id: true },
        }),
        tx.tbl_admission_stage.findFirst({
          where: { stage_name: "Application Submitted" },
          select: { stage_id: true },
        }),
      ]);

      if (!barangay)
        throw new Error(
          "The selected barangay does not belong to that district.",
        );
      if (!branch) throw new Error("The selected campus is unavailable.");
      if (!program) throw new Error("The selected program is unavailable.");
      if (!cycle) throw new Error("There is no active admission cycle.");
      if (!stage)
        throw new Error('The "Application Submitted" stage is missing.');

      let schoolId: number;

      if (input.school_entry_mode === "existing") {
        const existingSchoolId = parseId(input.school_id);

        if (!existingSchoolId) {
          throw new Error("Please select a previous school.");
        }

        const school = await tx.tbl_school.findUnique({
          where: { school_id: existingSchoolId },
          select: { school_id: true },
        });

        if (!school)
          throw new Error("The selected previous school was not found.");

        schoolId = school.school_id;
      } else {
        const school = await tx.tbl_school.create({
          data: {
            school_name: input.new_school_name.trim(),
            school_type: input.new_school_type.trim(),
            city_municipality: input.new_school_city.trim(),
          },
          select: { school_id: true },
        });

        schoolId = school.school_id;
      }

      const latestApplication = await tx.tbl_application.findFirst({
        where: { application_no: { startsWith: prefix } },
        orderBy: { application_no: "desc" },
        select: { application_no: true },
      });

      const lastSequence = latestApplication
        ? Number(latestApplication.application_no.slice(prefix.length))
        : 0;

      const applicationNo = `${prefix}${String(lastSequence + 1).padStart(4, "0")}`;

      const applicant = await tx.tbl_applicant.create({
        data: {
          last_name: lastName,
          first_name: firstName,
          middle_name: input.middle_name.trim() || null,
          suffix: suffix || null,
          sex: input.sex,
          birth_date: birthDate,
          email: input.email.trim() || null,
          mobile_no: input.mobile_no.trim() || null,
        },
        select: { applicant_id: true },
      });

      await tx.tbl_application.create({
        data: {
          applicant_id: applicant.applicant_id,
          school_id: schoolId,
          barangay_id: barangayId,
          branch_id: branchId,
          program_id: programId,
          cycle_id: cycle.cycle_id,
          current_stage_id: stage.stage_id,
          application_no: applicationNo,
          application_date: getManilaDate(),
        },
      });

      return applicant.applicant_id;
    });

    return { success: true as const, applicantId };
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
