// Permanently deletes applicants that have been in Archive History for more
// than a year. The app also runs this whenever the Applicants or Archive
// History page loads; schedule this script (cron / Task Scheduler) to purge
// even when nobody opens those pages:  npm run archive:purge
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { ARCHIVE_RETENTION_DAYS, purgeExpiredArchives } from "../features/admission/archive-core";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const deleted = await purgeExpiredArchives(prisma);
  console.log(`Deleted ${deleted} applicant(s) archived more than ${ARCHIVE_RETENTION_DAYS} days ago.`);
}

main()
  .catch((error) => {
    console.error("Archive purge failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
