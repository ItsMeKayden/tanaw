// Server-side reference data for the applicant wizard (imports Prisma).
import { prisma } from "@/lib/prisma";

export async function getApplicantFormReferenceData() {
  const [districts, branches, programs, schools] = await Promise.all([
    prisma.tbl_district.findMany({
      orderBy: { district_name: "asc" },
      select: {
        district_id: true,
        district_name: true,
        tbl_barangay: {
          orderBy: { barangay_name: "asc" },
          select: { barangay_id: true, barangay_name: true },
        },
      },
    }),
    prisma.tbl_branch.findMany({
      where: { is_active: true },
      orderBy: { branch_id: "asc" },
      select: { branch_id: true, branch_name: true, branch_code: true },
    }),
    prisma.tbl_program.findMany({
      where: { is_active: true },
      orderBy: { program_code: "asc" },
      select: { program_id: true, program_code: true, program_name: true },
    }),
    prisma.tbl_school.findMany({
      orderBy: { school_name: "asc" },
      select: {
        school_id: true,
        school_name: true,
        school_type: true,
        city_municipality: true,
      },
    }),
  ]);

  return {
    districts: districts.map(({ tbl_barangay, ...district }) => ({
      ...district,
      barangays: tbl_barangay,
    })),
    branches,
    programs,
    schools,
  };
}
