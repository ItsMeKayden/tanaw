"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { getAccountId, requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  changeUserRoleSchema,
  updateUserSchema,
  type UpdateUserValues,
} from "@/features/user-management/schemas";
import type { RoleName } from "@/lib/modules";
import type { UserActionResult } from "@/features/user-management/actions/create-user";

/**
 * Updates an account's name, email, role, status and (optionally) password.
 * Guards: only System Admins can edit System Admin accounts or grant that
 * role, and you can't deactivate your own account or change your own role
 * (either would lock you out of this page).
 */
export async function updateUser(input: UpdateUserValues): Promise<UserActionResult> {
  const currentUser = await requirePermission("users", "write");

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] ??= issue.message;
    }
    return { success: false, message: parsed.error.issues[0].message, fieldErrors };
  }

  const { userId, name, email, password, role, isActive } = parsed.data;
  const isSelf = userId === getAccountId(currentUser);

  try {
    const target = await prisma.tbl_user_account.findUnique({
      where: { user_id: userId },
      select: { tbl_role: { select: { role_name: true } } },
    });
    if (!target) return { success: false, message: "This account no longer exists." };

    const currentRole = target.tbl_role?.role_name;
    if (
      currentUser.role !== "SYSTEM_ADMIN" &&
      (currentRole === "SYSTEM_ADMIN" || role === "SYSTEM_ADMIN")
    ) {
      return { success: false, message: "Only a System Admin can manage System Admin accounts." };
    }
    if (isSelf && !isActive) {
      return {
        success: false,
        message: "You can't deactivate your own account.",
        fieldErrors: { isActive: "You can't deactivate your own account." },
      };
    }
    if (isSelf && role !== currentRole) {
      return {
        success: false,
        message: "You can't change your own role.",
        fieldErrors: { role: "You can't change your own role." },
      };
    }

    const duplicate = await prisma.tbl_user_account.findFirst({
      where: { user_id: { not: userId }, OR: [{ username: email }, { email }] },
      select: { user_id: true },
    });
    if (duplicate) {
      return {
        success: false,
        message: "Another account already uses this email.",
        fieldErrors: { email: "Another account already uses this email." },
      };
    }

    const selectedRole = await prisma.tbl_role.findUnique({
      where: { role_name: role },
      select: { role_id: true },
    });
    if (!selectedRole) {
      return { success: false, message: "The selected role does not exist. Run the seeder." };
    }

    await prisma.tbl_user_account.update({
      where: { user_id: userId },
      data: {
        username: email,
        full_name: name,
        email,
        is_active: isActive,
        role_id: selectedRole.role_id,
        ...(password ? { password_hash: await hash(password, 12) } : {}),
      },
    });

    revalidatePath("/user-management", "layout");
    return { success: true, message: `Account for ${name} updated.` };
  } catch (error) {
    console.error("User update failed:", error);
    return { success: false, message: "Failed to update the account. Please try again." };
  }
}

/** Quick role change for one account (same guards as updateUser). */
export async function changeUserRole(input: { userId: number; role: RoleName }): Promise<UserActionResult> {
  const currentUser = await requirePermission("users", "write");

  const parsed = changeUserRoleSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const { userId, role } = parsed.data;

  if (userId === getAccountId(currentUser)) {
    return { success: false, message: "You can't change your own role." };
  }

  try {
    const target = await prisma.tbl_user_account.findUnique({
      where: { user_id: userId },
      select: { full_name: true, tbl_role: { select: { role_name: true } } },
    });
    if (!target) return { success: false, message: "This account no longer exists." };

    if (
      currentUser.role !== "SYSTEM_ADMIN" &&
      (target.tbl_role?.role_name === "SYSTEM_ADMIN" || role === "SYSTEM_ADMIN")
    ) {
      return { success: false, message: "Only a System Admin can manage System Admin accounts." };
    }

    const selectedRole = await prisma.tbl_role.findUnique({
      where: { role_name: role },
      select: { role_id: true },
    });
    if (!selectedRole) return { success: false, message: "The selected role does not exist. Run the seeder." };

    await prisma.tbl_user_account.update({
      where: { user_id: userId },
      data: { role_id: selectedRole.role_id },
    });

    revalidatePath("/user-management", "layout");
    return { success: true, message: `${target.full_name}'s role was changed.` };
  } catch (error) {
    console.error("Change user role error:", error);
    return { success: false, message: "Failed to change the role. Please try again." };
  }
}
