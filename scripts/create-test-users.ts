import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test-user creation is disabled in production.");
  }

  const testUsers = [
    {
      name: "TANAW Test President",
      email: "test.president@example.com",
      role: "PRESIDENT" as const,
    },
    {
      name: "TANAW Test Admission",
      email: "test.admission@example.com",
      role: "ADMISSION" as const,
    },
    {
      name: "TANAW Test Registrar",
      email: "test.registrar@example.com",
      role: "REGISTRAR" as const,
    },
    {
      name: "TANAW Test Guidance",
      email: "test.guidance@example.com",
      role: "GUIDANCE" as const,
    },
  ];

  const password = process.env.TEST_USER_PASSWORD;

  if (!password || password.length < 8 || password.length > 72) {
    throw new Error(
      "Set TEST_USER_PASSWORD to a password between 8 and 72 characters.",
    );
  }

  const hashedPassword = await hash(password, 12);

  for (const testUser of testUsers) {
    await prisma.user.upsert({
      where: { email: testUser.email },
      update: {
        name: testUser.name,
        role: testUser.role,
        password: hashedPassword,
        isActive: true,
      },
      create: {
        ...testUser,
        password: hashedPassword,
      },
    });

    console.log(`Created/updated ${testUser.role} test account.`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to create test accounts:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
