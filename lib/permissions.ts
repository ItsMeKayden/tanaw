import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/authorization";
import { moduleCode, type ModuleName } from "@/lib/modules";

export type { ModuleName } from "@/lib/modules";

export type Permission = "read" | "write";

export async function hasPermission(
  role: UserRole,
  module: ModuleName,
  permission: Permission,
): Promise<boolean> {
  const permissionCode = `${moduleCode(module)}_${permission.toUpperCase()}`;

  const assignment = await prisma.tbl_role_permission.findFirst({
    where: {
      tbl_role: {
        role_name: role,
      },
      tbl_permission: {
        permission_code: permissionCode,
      },
    },
    select: {
      permission_id: true,
    },
  });

  return assignment !== null;
}

/**
 * Returns true when the role holds the permission on at least one of the
 * given modules (e.g. enrollment verification is shared by Admission and
 * Registrar).
 */
export async function hasAnyPermission(
  role: UserRole,
  modules: ModuleName[],
  permission: Permission,
): Promise<boolean> {
  const results = await Promise.all(
    modules.map((module) => hasPermission(role, module, permission)),
  );

  return results.some(Boolean);
}

export async function canWrite(
  role: UserRole,
  module: ModuleName,
): Promise<boolean> {
  return hasPermission(role, module, "write");
}
