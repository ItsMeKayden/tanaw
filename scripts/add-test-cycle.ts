// Adds a throwaway admission cycle (school year) for manual UI testing.
//   npx tsx scripts/add-test-cycle.ts                 -> "2099-2100 (TEST)"
//   npx tsx scripts/add-test-cycle.ts "2098-2099 (TEST)"
// Remove it afterwards with scripts/delete-test-cycle.ts.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const schoolYear = process.argv[2] ?? "2099-2100 (TEST)";

async function main() {
  const existing = await prisma.tbl_admission_cycle.findFirst({ where: { school_year: schoolYear } });
  if (existing) {
    console.log(`Cycle "${schoolYear}" already exists (cycle_id ${existing.cycle_id}). Nothing to do.`);
    return;
  }

  const cycle = await prisma.tbl_admission_cycle.create({
    data: {
      school_year: schoolYear,
      start_date: new Date(Date.UTC(2099, 7, 1)), // Aug 1, 2099
      end_date: new Date(Date.UTC(2100, 4, 31)), // May 31, 2100
      // Inactive so it never becomes the default cycle; pick it from the
      // School Year dropdown while testing.
      is_active: false,
    },
  });

  console.log(`Created admission cycle "${schoolYear}" (cycle_id ${cycle.cycle_id}).`);
  console.log("Select it from the School Year dropdown on the Exam Questions / Exam Scores pages.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
