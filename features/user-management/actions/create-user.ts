"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createUserSchema, type CreateUserValues } from "@/features/user-management/schemas";

export type UserActionResult = {
  success: boolean;
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
};

function issuesToResult(issues: { path: PropertyKey[]; message: string }[]): UserActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (field) fieldErrors[field] ??= issue.message;
  }
  return { success: false, message: issues[0]?.message ?? "Invalid input.", fieldErrors };
}

export async function createUser(input: CreateUserValues): Promise<UserActionResult> {
  const currentUser = await requirePermission("users", "write");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return issuesToResult(parsed.error.issues);

  const { name, email, password, role, isActive } = parsed.data;

  // Only System Admins can create other System Admin accounts.
  if (role === "SYSTEM_ADMIN" && currentUser.role !== "SYSTEM_ADMIN") {
    return {
      success: false,
      message: "Only a System Admin can create System Admin accounts.",
      fieldErrors: { role: "Only a System Admin can assign this role." },
    };
  }

  try {
    const existingUser = await prisma.tbl_user_account.findFirst({
      where: { OR: [{ username: email }, { email }] },
      select: { user_id: true },
    });
    if (existingUser) {
      return {
        success: false,
        message: "An account with this email already exists.",
        fieldErrors: { email: "An account with this email already exists." },
      };
    }

    const selectedRole = await prisma.tbl_role.findUnique({
      where: { role_name: role },
      select: { role_id: true },
    });
    if (!selectedRole) {
      return { success: false, message: "The selected role does not exist. Run the seeder." };
    }

    await prisma.tbl_user_account.create({
      data: {
        username: email,
        full_name: name,
        email,
        password_hash: await hash(password, 12),
        is_active: isActive,
        tbl_role: { connect: { role_id: selectedRole.role_id } },
      },
    });

    revalidatePath("/user-management", "layout");
    return { success: true, message: `Account for ${name} created.` };
  } catch (error) {
    console.error("User creation failed:", error);
    return { success: false, message: "Failed to create user account. Please try again." };
  }
}
