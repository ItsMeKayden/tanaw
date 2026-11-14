import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export function log(section: string, message: string) {
  console.log(`  [${section}] ${message}`);
}

export function warn(section: string, message: string) {
  console.warn(`  [${section}] WARNING: ${message}`);
}
