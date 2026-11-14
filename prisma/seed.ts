/**
 * TANAW database seeder.
 *
 *   npm run db:seed                 required + reference data (safe to re-run)
 *   npm run db:seed:demo            ...plus demo applicants, exams, quotas
 *   npm run db:seed:reset-demo      remove demo applicants, then re-create them
 *
 * Every step is idempotent: it only adds what is missing and never deletes
 * or overwrites real data (except test-account passwords, which are reset to
 * TEST_USER_PASSWORD on each run).
 */
import "dotenv/config";

import { prisma } from "./seeds/client";
import {
  seedRolesAndPermissions,
  seedSystemAdmin,
  seedTestUsers,
} from "./seeds/access-control";
import {
  seedAdmissionCycle,
  seedAdmissionStages,
  seedCampusesAndPrograms,
  seedDistrictsAndBarangays,
  seedPassingScore,
  seedSchools,
  seedCompetencies,
  seedProgramCompetencies,
  seedBoundaries,
} from "./seeds/reference-data";
import { resetDemoData, seedDemoData } from "./seeds/demo-data";

const args = new Set(process.argv.slice(2));
const withDemo = args.has("--demo") || process.env.SEED_DEMO === "true";
const resetDemo = args.has("--reset-demo");

async function main() {
  console.log("Seeding TANAW database...");

  console.log("Access control");
  await seedRolesAndPermissions();
  await seedSystemAdmin();
  await seedTestUsers();

  console.log("Reference data");
  await seedAdmissionStages();
  await seedDistrictsAndBarangays();
  await seedBoundaries();
  await seedCampusesAndPrograms();
  await seedSchools();
  await seedAdmissionCycle();
  await seedPassingScore();
  await seedCompetencies();
  await seedProgramCompetencies();

  if (resetDemo) {
    console.log("Demo data (reset)");
    await resetDemoData();
  }

  if (withDemo) {
    console.log("Demo data");
    await seedDemoData();
  } else {
    console.log("Demo data skipped (run `npm run db:seed:demo` to add sample applicants).");
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
