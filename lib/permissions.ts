import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/authorization";

export type ModuleName =
  | "dashboard"
  | "map"
  | "admission"
  | "course"
  | "users"
  | "registrar"
  | "guidance"
  | "reports";

export type Permission = "read" | "write";

const moduleNames: Record<ModuleName, string> = {
  dashboard: "DASHBOARD",
  map: "MAP",
  admission: "ADMISSION",
  course: "COURSE",
  users: "USERS",
  registrar: "REGISTRAR",
  guidance: "GUIDANCE",
  reports: "REPORTS",
};

export async function hasPermission(
  role: UserRole,
  module: ModuleName,
  permission: Permission,
): Promise<boolean> {
  const permissionCode = `${moduleNames[module]}_${permission.toUpperCase()}`;

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

export async function canWrite(
  role: UserRole,
  module: ModuleName,
): Promise<boolean> {
  return hasPermission(role, module, "write");
}
