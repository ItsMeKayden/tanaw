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

async function filterNavigation(
  items: NavigationItem[],
  role: UserRole,
): Promise<NavigationItem[]> {
  const filteredItems: (NavigationItem | null)[] = await Promise.all(
    items.map(async (item): Promise<NavigationItem | null> => {
      const allowed = await hasPermission(role, item.permission, "read");

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
