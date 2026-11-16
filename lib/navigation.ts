import { hasAnyPermission, type ModuleName } from "@/lib/permissions";
import type { UserRole } from "@/lib/authorization";

/** Icon keys rendered by the sidebar (components can't cross the server boundary). */
export type NavigationIcon =
  | "dashboard"
  | "map"
  | "admission"
  | "analytics"
  | "recommendation"
  | "users"
  | "registrar"
  | "guidance";

export type NavigationItem = {
  label: string;
  href?: string;
  icon?: NavigationIcon;
  /** Read access to any one of these modules shows the item. */
  permission: ModuleName | ModuleName[];
  children?: NavigationItem[];
};

// Enrollment verification is shared by the Admission and Registrar offices.
const enrollmentVerificationModules: ModuleName[] = ["admission", "registrar"];

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard" },
  { label: "Map", href: "/map", icon: "map", permission: "map" },
  {
    label: "Admission",
    icon: "admission",
    permission: enrollmentVerificationModules,
    children: [
      { label: "Applicant", href: "/admission", permission: "admission" },
      { label: "Tracker", href: "/admission/tracker", permission: "admission" },
      {
        label: "Exam",
        permission: "admission",
        children: [
          { label: "Exam Schedule", href: "/admission/exam/schedule", permission: "admission" },
          { label: "Exam Scores", href: "/admission/exam/scores", permission: "admission" },
        ],
      },
      {
        label: "Enrollment Verification",
        href: "/admission/enrollment-verification",
        permission: enrollmentVerificationModules,
      },
      { label: "Quota", href: "/admission/quota", permission: "admission" },
    ],
  },
  { label: "Analytics", href: "/reports", icon: "analytics", permission: "reports" },
  {
    label: "Course Recommendation",
    icon: "recommendation",
    permission: "recommendation",
    children: [
      { label: "Recommendations", href: "/recommendation", permission: "recommendation" },
      { label: "Score Breakdown", href: "/recommendation/breakdown", permission: "recommendation" },
      { label: "Course Comparison", href: "/recommendation/compare", permission: "recommendation" },
      { label: "Mapping Settings", href: "/recommendation/settings", permission: "recommendation" },
    ],
  },
  { label: "Users & Roles", href: "/users-roles", icon: "users", permission: "users" },
  { label: "Registrar", href: "/registrar", icon: "registrar", permission: "registrar" },
  { label: "Guidance", href: "/guidance", icon: "guidance", permission: "guidance" },
];
async function filterNavigation(
  items: NavigationItem[],
  role: UserRole,
): Promise<NavigationItem[]> {
  const filteredItems: (NavigationItem | null)[] = await Promise.all(
    items.map(async (item): Promise<NavigationItem | null> => {
      const modules = Array.isArray(item.permission)
        ? item.permission
        : [item.permission];
      const allowed = await hasAnyPermission(role, modules, "read");

      if (!allowed) {
        return null;
      }

      const children = item.children
        ? await filterNavigation(item.children, role)
        : undefined;

      return {
        ...item,
        children,
      };
    }),
  );

  return filteredItems.filter(
    (item): item is NavigationItem =>
      item !== null && (!item.children || item.children.length > 0),
  );
}

export async function getNavigationItems(
  role: UserRole,
): Promise<NavigationItem[]> {
  return filterNavigation(navigationItems, role);
}
