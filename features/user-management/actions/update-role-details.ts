"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { roleDetailsSchema, type RoleDetailsValues } from "@/features/user-management/schemas";
import type { UserActionResult } from "@/features/user-management/actions/create-user";

/** Renames a role (its display label) and updates its description. */
export async function updateRoleDetails(input: RoleDetailsValues): Promise<UserActionResult> {
  await requireRole(["SYSTEM_ADMIN"]);

  const parsed = roleDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] ??= issue.message;
    }
    return { success: false, message: parsed.error.issues[0].message, fieldErrors };
  }
  const { role_name, display_name, description } = parsed.data;

  try {
    const duplicate = await prisma.tbl_role.findFirst({
      where: { role_name: { not: role_name }, display_name: { equals: display_name, mode: "insensitive" } },
      select: { role_id: true },
    });
    if (duplicate) {
      return {
        success: false,
        message: "Another role already uses this name.",
        fieldErrors: { display_name: "Another role already uses this name." },
      };
    }

    const { count } = await prisma.tbl_role.updateMany({
      where: { role_name },
      data: { display_name, description: description || null },
    });
    if (count === 0) return { success: false, message: "This role is missing. Run the seeder." };

    // Role names appear in the header and across User Management.
    revalidatePath("/", "layout");
    return { success: true, message: `Role "${display_name}" saved.` };
  } catch (error) {
    console.error("Update role details error:", error);
    return { success: false, message: "Failed to save the role. Please try again." };
  }
}
