import type { UserRole } from "@/lib/authorization";

export type ModuleName =
  | "dashboard"
  | "admission"
  | "registrar"
  | "guidance"
  | "reports";

export type Permission = "read" | "write";

const permissions: Record<ModuleName, Record<UserRole, Permission[]>> = {
  dashboard: {
    PRESIDENT: ["read"],
    ADMISSION: ["read"],
    REGISTRAR: ["read"],
    GUIDANCE: ["read"],
  },

  admission: {
    PRESIDENT: ["read"],
    ADMISSION: ["read", "write"],
    REGISTRAR: [],
    GUIDANCE: [],
  },

  registrar: {
    PRESIDENT: ["read"],
    ADMISSION: [],
    REGISTRAR: ["read", "write"],
    GUIDANCE: [],
  },

  guidance: {
    PRESIDENT: ["read"],
    ADMISSION: [],
    REGISTRAR: [],
    GUIDANCE: ["read", "write"],
  },

  reports: {
    PRESIDENT: ["read"],
    ADMISSION: ["read", "write"],
    REGISTRAR: ["read", "write"],
    GUIDANCE: ["read", "write"],
  },
};

export function hasPermission(
  role: UserRole,
  module: ModuleName,
  permission: Permission,
): boolean {
  return permissions[module]?.[role]?.includes(permission) ?? false;
}

export function canWrite(role: UserRole, module: ModuleName): boolean {
  return hasPermission(role, module, "write");
}
