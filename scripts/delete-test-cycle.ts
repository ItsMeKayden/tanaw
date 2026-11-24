// Deletes a test admission cycle and the exam data created under it while
// testing (exam, questions, sessions, results, passing score, quota).
//   npx tsx scripts/delete-test-cycle.ts                 -> "2099-2100 (TEST)"
//   npx tsx scripts/delete-test-cycle.ts "2098-2099 (TEST)"
// Refuses to run if the cycle has applications, to avoid deleting applicant data.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const schoolYear = process.argv[2] ?? "2099-2100 (TEST)";

async function main() {
  const cycle = await prisma.tbl_admission_cycle.findFirst({ where: { school_year: schoolYear } });
  if (!cycle) {
    console.log(`No cycle named "${schoolYear}" found. Nothing to delete.`);
    return;
  }

  const appCount = await prisma.tbl_application.count({ where: { cycle_id: cycle.cycle_id } });
  if (appCount > 0) {
    console.error(
      `Cycle "${schoolYear}" has ${appCount} application(s). Refusing to delete so applicant data is not removed. ` +
        "Remove those applications first if you really want to delete this cycle.",
    );
    process.exitCode = 1;
    return;
  }

  const exams = await prisma.tbl_exam.findMany({ where: { cycle_id: cycle.cycle_id }, select: { exam_id: true } });
  const examIds = exams.map((e) => e.exam_id);

  await prisma.$transaction(async (tx) => {
    if (examIds.length > 0) {
      // Results cascade their question responses + subject scores; exams cascade
      // their questions + sessions. Delete results first (exam_id is NoAction).
      await tx.tbl_exam_result.deleteMany({ where: { exam_id: { in: examIds } } });
      await tx.tbl_exam.deleteMany({ where: { cycle_id: cycle.cycle_id } });
    }
    await tx.tbl_passing_score_setting.deleteMany({ where: { cycle_id: cycle.cycle_id } });
    await tx.tbl_quota.deleteMany({ where: { cycle_id: cycle.cycle_id } });
    await tx.tbl_admission_cycle.delete({ where: { cycle_id: cycle.cycle_id } });
  });

  console.log(
    `Deleted cycle "${schoolYear}" (cycle_id ${cycle.cycle_id})` +
      (examIds.length > 0 ? ` and ${examIds.length} exam(s) with their questions/sessions/results.` : "."),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
