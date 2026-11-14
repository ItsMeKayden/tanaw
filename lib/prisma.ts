import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({ adapter });
}

// In development the client is cached on globalThis so hot reloads do not
// open new connection pools. After `prisma generate`, the regenerated module
// exports a *new* PrismaClient class, but the cached instance still carries
// the old schema ("Unknown field ... for select statement" errors).
// Only reuse the cached client if it was built from the current class.
const cached = globalForPrisma.prisma;
const isCurrent = cached instanceof PrismaClient;

if (cached && !isCurrent) {
  void (cached as { $disconnect?: () => Promise<void> })
    .$disconnect?.()
    .catch(() => {});
}

const prisma = isCurrent ? cached : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
