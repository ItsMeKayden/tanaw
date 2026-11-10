"use server";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type UpdateApplicantInput = {
  applicant_id: number;
  application_id: number;

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseId(value: unknown): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function updateApplicant(input: UpdateApplicantInput) {
  await requirePermission("admission", "write");

  const lastName = clean(input.last_name);
  const firstName = clean(input.first_name);
  const middleName = clean(input.middle_name);
  const suffix = clean(input.suffix);
  const sex = clean(input.sex);
  const birthDateValue = clean(input.birth_date);
  const email = clean(input.email);
  const mobileNo = clean(input.mobile_no);

  const applicantId = parseId(input.applicant_id);
  const applicationId = parseId(input.application_id);

  const districtId = parseId(input.district_id);
  const barangayId = parseId(input.barangay_id);
  const branchId = parseId(input.branch_id);
  const programId = parseId(input.program_id);

  if (!applicantId || !applicationId) {
    return { error: "Invalid applicant or application ID." };
  }

  if (!lastName || !firstName || !birthDateValue || !sex) {
    return {
      error: "Please complete all required personal information.",
    };
  }

  if (suffix.length > 20) {
    return { error: "Suffix must not exceed 20 characters." };
  }

  if (
    lastName.length > 100 ||
    firstName.length > 100 ||
    middleName.length > 100 ||
    email.length > 150 ||
    mobileNo.length > 50
  ) {
    return { error: "Some personal information exceeds the allowed length." };
  }

  if (!["Male", "Female"].includes(sex)) {
    return { error: "Please select a valid sex." };
  }

  const birthDate = new Date(`${birthDateValue}T00:00:00.000Z`);

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== birthDateValue
  ) {
    return { error: "Please provide a valid birth date." };
  }

  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)
  ) {
    return { error: "Please provide a valid email address." };
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

  const newSchoolName = clean(input.new_school_name);
  const newSchoolType = clean(input.new_school_type);
  const newSchoolCity = clean(input.new_school_city);

  if (input.school_entry_mode === "new") {
    if (!newSchoolName || !newSchoolType || !newSchoolCity) {
      return { error: "Please complete all new school information." };
    }

    if (
      newSchoolName.length > 150 ||
      newSchoolCity.length > 100 ||
      !["Public", "Private", "Other"].includes(newSchoolType)
    ) {
      return { error: "Please provide valid new school information." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Verify that the application belongs to this applicant.
      const application = await tx.tbl_application.findFirst({
        where: {
          application_id: applicationId,
          applicant_id: applicantId,
        },
        select: {
          application_id: true,
        },
      });

      if (!application) {
        throw new Error("The applicant's application could not be found.");
      }

      // Validate the selected reference records.
      const [barangay, branch, program] = await Promise.all([
        tx.tbl_barangay.findFirst({
          where: {
            barangay_id: barangayId,
            district_id: districtId,
          },
          select: { barangay_id: true },
        }),

        tx.tbl_branch.findFirst({
          where: {
            branch_id: branchId,
            is_active: true,
          },
          select: { branch_id: true },
        }),

        tx.tbl_program.findFirst({
          where: {
            program_id: programId,
            is_active: true,
          },
          select: { program_id: true },
        }),
      ]);

      if (!barangay) {
        throw new Error(
          "The selected barangay does not belong to that district.",
        );
      }

      if (!branch) {
        throw new Error("The selected campus is unavailable.");
      }

      if (!program) {
        throw new Error("The selected program is unavailable.");
      }

      // Resolve the previous school.
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

        if (!school) {
          throw new Error("The selected previous school was not found.");
        }

        schoolId = school.school_id;
      } else {
        const school = await tx.tbl_school.create({
          data: {
            school_name: newSchoolName,
            school_type: newSchoolType,
            city_municipality: newSchoolCity,
          },
          select: { school_id: true },
        });

        schoolId = school.school_id;
      }

      // Update the existing applicant.
      await tx.tbl_applicant.update({
        where: {
          applicant_id: applicantId,
        },
        data: {
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName || null,
          suffix: suffix || null,
          sex,
          birth_date: birthDate,
          email: email || null,
          mobile_no: mobileNo || null,
        },
      });

      // Update only the selected application.
      // Application number, date, cycle, and stage remain unchanged.
      await tx.tbl_application.update({
        where: {
          application_id: applicationId,
        },
        data: {
          school_id: schoolId,
          barangay_id: barangayId,
          branch_id: branchId,
          program_id: programId,
        },
      });
    });

    return { success: true as const };
  } catch (error) {
    console.error("Update applicant error:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong while updating the applicant.",
    };
  }
}
