import { hasAnyPermission, type ModuleName } from "@/lib/permissions";
import type { UserRole } from "@/lib/authorization";

/** Icon keys rendered by the sidebar (components can't cross the server boundary). */
export type NavigationIcon =
  | "dashboard"
  | "map"
  | "admission"
  | "analytics"
  | "recommendation"
  | "users";

export type NavigationItem = {
  label: string;
  href?: string;
  icon?: NavigationIcon;
  /**
   * Read access to any one of these modules shows the item. When siblings
   * share a label, only the first one the role can read is shown, so each
   * office gets its own view of a page under the same menu entry.
   */
  permission: ModuleName | ModuleName[];
  requiredRole?: UserRole;
  children?: NavigationItem[];
};

// Enrollment verification is shared by the Admission and Registrar offices.
const enrollmentVerificationModules: ModuleName[] = ["admission", "registrar"];
// Offices that see (part of) the Admission menu.
const admissionMenuModules: ModuleName[] = ["admission", "registrar", "guidance"];

const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    permission: "dashboard",
  },
  { label: "Map", href: "/map", icon: "map", permission: "map" },
  {
    label: "Admission",
    icon: "admission",
    permission: admissionMenuModules,
    children: [
      { label: "Applicant", href: "/admission", permission: "admission" },
      { label: "Applicant", href: "/registrar/applicants", permission: "registrar" },
      { label: "Applicant", href: "/guidance/applicants", permission: "guidance" },
      {
        label: "Exam",
        permission: ["admission", "registrar"],
        children: [
          {
            label: "Exam Schedule",
            href: "/admission/exam/schedule",
            permission: "admission",
          },
          {
            label: "Exam Schedule",
            href: "/registrar/exam-schedule",
            permission: "registrar",
          },
          {
            label: "Exam Scores",
            href: "/admission/exam/scores",
            permission: "admission",
          },
        ],
      },
      {
        label: "Enrollment Verification",
        href: "/admission/enrollment-verification",
        permission: enrollmentVerificationModules,
      },
      { label: "Additional Applicants", href: "/admission/additional-applicants", permission: "admission" },
      { label: "Quota", href: "/admission/quota", permission: "admission" },
      {
        label: "Archive History",
        href: "/admission/archive",
        permission: "admission",
      },
    ],
  },
  {
    label: "Analytics",
    icon: "analytics",
    permission: "reports",
    children: [
      { label: "Overview", href: "/reports", permission: "reports" },
      { label: "Passing Rate", href: "/reports/passing-rate", permission: "reports" },
      { label: "Top Schools", href: "/reports/top-schools", permission: "reports" },
      { label: "Item Analysis", href: "/reports/item-analysis", permission: "reports" },
    ],
  },
  {
    label: "Course Recommendation",
    icon: "recommendation",
    permission: "recommendation",
    children: [
      {
        label: "Recommendations",
        href: "/recommendation",
        permission: "recommendation",
      },
      {
        label: "Score Breakdown",
        href: "/recommendation/breakdown",
        permission: "recommendation",
      },
      {
        label: "Course Comparison",
        href: "/recommendation/compare",
        permission: "recommendation",
      },
      {
        label: "Mapping Settings",
        href: "/recommendation/settings",
        permission: "recommendation",
      },
    ],
  },
  {
    label: "User Management",
    icon: "users",
    // Accounts and Roles are admin-only; Audit Log follows the audit
    // permission. The group hides itself when no child is left.
    permission: ["users", "audit"],
    children: [
      {
        label: "User Accounts",
        href: "/user-management/accounts",
        permission: "users",
        requiredRole: "SYSTEM_ADMIN",
      },
      {
        label: "Roles & Permissions",
        href: "/user-management/roles",
        permission: "users",
        requiredRole: "SYSTEM_ADMIN",
      },
      {
        label: "Audit Log",
        href: "/user-management/audit-log",
        permission: "audit",
      },
    ],
  },
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
      const allowed = item.requiredRole
        ? item.requiredRole === role
        : await hasAnyPermission(role, modules, "read");

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

  const seenLabels = new Set<string>();
  return filteredItems.filter((item): item is NavigationItem => {
    if (item === null || (item.children && item.children.length === 0)) {
      return false;
    }
    // Same-label siblings are per-office variants: keep the first allowed one.
    if (seenLabels.has(item.label)) return false;
    seenLabels.add(item.label);
    return true;
  });
}

export async function getNavigationItems(
  role: UserRole,
): Promise<NavigationItem[]> {
  return filterNavigation(navigationItems, role);
}
