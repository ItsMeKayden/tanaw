"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createUserSchema, type CreateUserValues } from "@/features/users-roles/schemas";

type CreateUserResult = {
  success: boolean;
  message: string;
  fieldErrors?: Partial<Record<keyof CreateUserValues, string>>;
};

export async function createUser(input: CreateUserValues): Promise<CreateUserResult> {
  await requirePermission("users", "write");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: CreateUserResult["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CreateUserValues;
      fieldErrors[field] ??= issue.message;
    }
    return { success: false, message: parsed.error.issues[0].message, fieldErrors };
  }

  const { name: cleanName, email: cleanEmail, password, role } = parsed.data;

  try {
    const existingUser = await prisma.tbl_user_account.findFirst({
      where: {
        OR: [{ username: cleanEmail }, { email: cleanEmail }],
      },
      select: {
        user_id: true,
      },
    });

    if (existingUser) {
      return {
        success: false,
        message: "An account with this email already exists.",
      };
    }

    const selectedRole = await prisma.tbl_role.findUnique({
      where: {
        role_name: role,
      },
      select: {
        role_id: true,
      },
    });

    if (!selectedRole) {
      return {
        success: false,
        message: "The selected role does not exist.",
      };
    }

    const hashedPassword = await hash(password, 12);

    await prisma.tbl_user_account.create({
      data: {
        username: cleanEmail,
        full_name: cleanName,
        email: cleanEmail,
        password_hash: hashedPassword,
        is_active: true,
        tbl_role: {
          connect: {
            role_id: selectedRole.role_id,
          },
        },
      },
    });

    revalidatePath("/users-roles");

    return {
      success: true,
      message: "User account created successfully.",
    };
  } catch (error) {
    console.error("User creation failed:", error);

    return {
      success: false,
      message: "Failed to create user account. Please try again.",
    };
  }
}
