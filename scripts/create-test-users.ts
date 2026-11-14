/**
 * Creates/updates the four test accounts only.
 * The main seeder (`npm run db:seed`) already does this; this script is kept
 * for resetting test-account passwords without re-running the full seed.
 */
import "dotenv/config";

import { prisma } from "../prisma/seeds/client";
import { seedTestUsers } from "../prisma/seeds/access-control";

seedTestUsers()
  .catch((error) => {
    console.error("Failed to create test accounts:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
