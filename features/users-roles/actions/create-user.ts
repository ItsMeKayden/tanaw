"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { requirePermission, type UserRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type CreateUserResult = {
  success: boolean;
  message: string;
};

const allowedRoles: UserRole[] = [
  "SYSTEM_ADMIN",
  "PRESIDENT",
  "ADMISSION",
  "REGISTRAR",
  "GUIDANCE",
];

export async function createUser(
  formData: FormData,
): Promise<CreateUserResult> {
  await requirePermission("users", "write");

  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const role = formData.get("role");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof role !== "string"
  ) {
    return {
      success: false,
      message: "Please complete all required fields.",
    };
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanName.length < 2 || cleanName.length > 150) {
    return {
      success: false,
      message: "Name must be between 2 and 150 characters.",
    };
  }

  if (
    cleanEmail.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    return {
      success: false,
      message: "Please enter a valid email address.",
    };
  }

  if (password.length < 8 || password.length > 72) {
    return {
      success: false,
      message: "Password must be between 8 and 72 characters.",
    };
  }

  if (!allowedRoles.includes(role as UserRole)) {
    return {
      success: false,
      message: "Invalid user role.",
    };
  }

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
