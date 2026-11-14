import type { UserRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import type { ModuleName } from "@/lib/permissions";

type UserAccount = {
  user_id: number;
  full_name: string;
  username: string;
  email: string;
  is_active: boolean | null;
  created_at: Date | null;
  tbl_role: {
    role_name: string;
  } | null;
};

type UserPermissionMatrixProps = {
  users: UserAccount[];
};

const modules: { key: ModuleName; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "map", label: "Map" },
  { key: "admission", label: "Admission" },
  { key: "course", label: "Course" },
  { key: "users", label: "Users" },
  { key: "registrar", label: "Registrar" },
  { key: "guidance", label: "Guidance" },
  { key: "reports", label: "Reports" },
];

const moduleCodes: Record<ModuleName, string> = {
  dashboard: "DASHBOARD",
  map: "MAP",
  admission: "ADMISSION",
  course: "COURSE",
  users: "USERS",
  registrar: "REGISTRAR",
  guidance: "GUIDANCE",
  reports: "REPORTS",
};

function getPermissionLabel(
  role: UserRole,
  module: ModuleName,
  permissions: Set<string>,
) {
  const moduleCode = moduleCodes[module];

  const canRead = permissions.has(`${role}:${moduleCode}_READ`);
  const canWrite = permissions.has(`${role}:${moduleCode}_WRITE`);

  if (canRead && canWrite) return "Read & Write";
  if (canRead) return "Read";
  if (canWrite) return "Write";

  return "No Access";
}

export async function UserPermissionMatrix({
  users,
}: UserPermissionMatrixProps) {
  const assignments = await prisma.tbl_role_permission.findMany({
    select: {
      tbl_role: {
        select: {
          role_name: true,
        },
      },
      tbl_permission: {
        select: {
          permission_code: true,
        },
      },
    },
  });

  const permissions = new Set(
    assignments.map(
      (assignment) =>
        `${assignment.tbl_role.role_name}:${assignment.tbl_permission.permission_code}`,
    ),
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1200px] text-sm">
        <thead className="bg-muted">
          <tr className="text-left">
            <th className="sticky left-0 z-10 min-w-[220px] bg-muted px-4 py-3 font-semibold">
              Account
            </th>

            <th className="min-w-[140px] px-4 py-3 font-semibold">Role</th>

            {modules.map((module) => (
              <th
                key={module.key}
                className="min-w-[130px] px-4 py-3 text-center font-semibold"
              >
                {module.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {users.map((user) => {
            const role = user.tbl_role?.role_name as UserRole | undefined;

            return (
              <tr key={user.user_id} className="border-t">
                <td className="sticky left-0 z-10 bg-background px-4 py-3">
                  <p className="font-medium">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>

                <td className="px-4 py-3">
                  {role ? role.replaceAll("_", " ") : "Unassigned"}
                </td>

                {modules.map((module) => {
                  const permission = role
                    ? getPermissionLabel(role, module.key, permissions)
                    : "No Access";

                  return (
                    <td key={module.key} className="px-4 py-3 text-center">
                      <span
                        className={
                          permission === "Read & Write"
                            ? "font-medium text-green-600"
                            : permission === "Read"
                              ? "font-medium text-blue-600"
                              : permission === "Write"
                                ? "font-medium text-orange-600"
                                : "text-muted-foreground"
                        }
                      >
                        {permission}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {users.length === 0 && (
            <tr>
              <td
                colSpan={modules.length + 2}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                No registered users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
