"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { MODULES } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import {
  rolePermissionsSchema,
  type RolePermissionsInput,
} from "@/features/users-roles/schemas";

type ActionResult = { success: true; message: string } | { error: string };

/**
 * Replaces the module access of the given roles. "WRITE" grants read and
 * write. SYSTEM_ADMIN cannot be changed, and you cannot remove Users & Roles
 * write access from your own role (that would lock you out of this page).
 */
export async function updateRolePermissions(rawInput: RolePermissionsInput): Promise<ActionResult> {
  const user = await requirePermission("users", "write");

  const parsed = rolePermissionsSchema.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  for (const role of input) {
    if (role.role_name === "SYSTEM_ADMIN") {
      return { error: "System Admin access cannot be changed." };
    }
    if (role.role_name === user.role && role.access.USERS !== "WRITE") {
      return { error: "You can't remove Users & Roles write access from your own role." };
    }
  }

  try {
    const [roles, permissions] = await Promise.all([
      prisma.tbl_role.findMany({ select: { role_id: true, role_name: true } }),
      prisma.tbl_permission.findMany({ select: { permission_id: true, permission_code: true } }),
    ]);
    const roleIds = new Map(roles.map((r) => [r.role_name, r.role_id]));
    const permissionIds = new Map(permissions.map((p) => [p.permission_code, p.permission_id]));
    const managedIds = MODULES.flatMap((m) =>
      [`${m.code}_READ`, `${m.code}_WRITE`].map((code) => permissionIds.get(code)),
    ).filter((id): id is number => id !== undefined);

    await prisma.$transaction(async (tx) => {
      for (const role of input) {
        const roleId = roleIds.get(role.role_name);
        if (!roleId) throw new Error(`Role ${role.role_name} is missing. Run the seeder.`);

        const desired = MODULES.flatMap((m) => {
          const level = role.access[m.code];
          if (level === "WRITE") return [`${m.code}_READ`, `${m.code}_WRITE`];
          if (level === "READ") return [`${m.code}_READ`];
          return [];
        }).map((code) => {
          const id = permissionIds.get(code);
          if (!id) throw new Error(`Permission ${code} is missing. Run the seeder.`);
          return id;
        });

        await tx.tbl_role_permission.deleteMany({
          where: {
            role_id: roleId,
            permission_id: { in: managedIds.filter((id) => !desired.includes(id)) },
          },
        });
        await tx.tbl_role_permission.createMany({
          data: desired.map((permission_id) => ({ role_id: roleId, permission_id })),
          skipDuplicates: true,
        });
      }
    });

    // Navigation and every page's access checks depend on these permissions.
    revalidatePath("/", "layout");

    return { success: true, message: "Role permissions saved. Changes apply on the users' next page load." };
  } catch (error) {
    console.error("Update role permissions error:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong while saving." };
  }
}
