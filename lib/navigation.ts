import { hasPermission, type ModuleName } from "@/lib/permissions";
import type { UserRole } from "@/lib/authorization";

export type NavigationItem = {
  label: string;
  href: string;
  permission: ModuleName;
};

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", permission: "dashboard" },
  { label: "Map", href: "/map", permission: "map" },
  { label: "Admission", href: "/admission", permission: "admission" },
  { label: "Analytics", href: "/reports", permission: "reports" },
  { label: "Course", href: "/course", permission: "course" },
  { label: "Users & Roles", href: "/users-roles", permission: "users" },
  { label: "Registrar", href: "/registrar", permission: "registrar" },
  { label: "Guidance", href: "/guidance", permission: "guidance" },
];

export function getNavigationItems(role: UserRole) {
  return navigationItems.filter((item) =>
    hasPermission(role, item.permission, "read"),
  );
}
