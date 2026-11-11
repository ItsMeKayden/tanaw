import { hasPermission, type ModuleName } from "@/lib/permissions";
import type { UserRole } from "@/lib/authorization";

export type NavigationItem = {
  label: string;
  href?: string;
  permission: ModuleName;
  children?: NavigationItem[];
};

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", permission: "dashboard" },
  { label: "Map", href: "/map", permission: "map" },
  {
    label: "Admission",
    permission: "admission",
    children: [
      {
        label: "Applicant",
        href: "/admission",
        permission: "admission",
      },
      {
        label: "Tracker",
        href: "/admission/tracker",
        permission: "admission",
      },
      {
        label: "Exam",
        permission: "admission",
        children: [
          {
            label: "Exam Schedule",
            href: "/admission/exam/schedule",
            permission: "admission",
          },
          {
            label: "Exam Scores",
            href: "/admission/exam/scores",
            permission: "admission",
          },
          {
            label: "Enrollment Verification",
            href: "/admission/enrollment-verification",
            permission: "admission",
          },
        ],
      },
    ],
  },

  { label: "Analytics", href: "/reports", permission: "reports" },
  { label: "Course", href: "/course", permission: "course" },
  { label: "User Access and Roles", href: "/users-roles", permission: "users" },
  { label: "Registrar", href: "/registrar", permission: "registrar" },
  { label: "Guidance", href: "/guidance", permission: "guidance" },
];

function filterNavigation(
  items: NavigationItem[],
  role: UserRole,
): NavigationItem[] {
  return items
    .filter((item) => hasPermission(role, item.permission, "read"))
    .map(
      (item): NavigationItem => ({
        ...item,
        children: item.children
          ? filterNavigation(item.children, role)
          : undefined,
      }),
    )
    .filter((item) => !item.children || item.children.length > 0);
}

export function getNavigationItems(role: UserRole): NavigationItem[] {
  return filterNavigation(navigationItems, role);
}
