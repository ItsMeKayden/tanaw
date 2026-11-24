/**
 * Permission modules (tbl_permission.module_name) and the default access each
 * role gets. Single source of truth for permissions, navigation, the User
 * Management page, and the seeder. No imports — safe for client and seed code.
 */

export const MODULES = [
  { key: "dashboard", code: "DASHBOARD", label: "Dashboard" },
  { key: "map", code: "MAP", label: "Map" },
  { key: "admission", code: "ADMISSION", label: "Admission" },
  { key: "recommendation", code: "RECOMMENDATION", label: "Course Recommendation" },
  { key: "reports", code: "REPORTS", label: "Analytics" },
  { key: "users", code: "USERS", label: "User Management" },
  { key: "registrar", code: "REGISTRAR", label: "Registrar" },
  { key: "guidance", code: "GUIDANCE", label: "Guidance" },
  { key: "audit", code: "AUDIT", label: "Audit Log" },
] as const;

export type ModuleName = (typeof MODULES)[number]["key"];
export type ModuleCode = (typeof MODULES)[number]["code"];
export type PermissionType = "READ" | "WRITE";

export const ROLE_NAMES = [
  "SYSTEM_ADMIN",
  "PRESIDENT",
  "ADMISSION",
  "REGISTRAR",
  "GUIDANCE",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  SYSTEM_ADMIN: "System Admin",
  PRESIDENT: "President",
  ADMISSION: "Admission",
  REGISTRAR: "Registrar",
  GUIDANCE: "Guidance",
};

export function moduleCode(key: ModuleName): ModuleCode {
  return MODULES.find((module) => module.key === key)!.code;
}

/**
 * Default role access, applied by the seeder only to permissions that have
 * no assignments yet — so changes made on the User Management page persist.
 */
export const DEFAULT_ROLE_ACCESS: Record<
  RoleName,
  Partial<Record<ModuleCode, PermissionType[]>>
> = {
  // Admin: Dashboard (view) + User Management (full). No access to other modules.
  SYSTEM_ADMIN: {
    DASHBOARD: ["READ"],
    USERS: ["READ", "WRITE"],
    AUDIT: ["READ", "WRITE"],
  },
  // President: Dashboard + Map (read/filter) + Analytics (view & export). No write.
  PRESIDENT: {
    DASHBOARD: ["READ"],
    MAP: ["READ"],
    REPORTS: ["READ"],
  },
  // Admission Office: Dashboard + Map (full access) + Admission (full CRUD) + Analytics (view/create/export) + Course Recommendation (view only).
  ADMISSION: {
    DASHBOARD: ["READ"],
    MAP: ["READ", "WRITE"],
    ADMISSION: ["READ", "WRITE"],
    REPORTS: ["READ", "WRITE"],
    RECOMMENDATION: ["READ"],
  },
  // Guidance Office: Dashboard + Admission (view & update exam results/advising notes) + Analytics (view & export) + Course Recommendation (full access).
  GUIDANCE: {
    DASHBOARD: ["READ"],
    GUIDANCE: ["READ", "WRITE"],
    REPORTS: ["READ"],
    RECOMMENDATION: ["READ", "WRITE"],
  },
  // Registrar Office: Dashboard + Admission (view & update enrollment status) + Analytics (view & export).
  REGISTRAR: {
    DASHBOARD: ["READ"],
    REGISTRAR: ["READ", "WRITE"],
    REPORTS: ["READ"],
  },
};
