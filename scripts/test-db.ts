import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.user.count();
  console.log("Database connected. User count:", count);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
