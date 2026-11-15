import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { ProfileTabs } from "@/components/admission/profile-tabs";
import { CreateUserForm } from "@/components/users-roles/create-user-form";
import RolePermissionEditor from "@/components/users-roles/role-permission-editor";
import type { AccessLevel } from "@/features/users-roles/schemas";
import { requirePermission } from "@/lib/authorization";
import { MODULES, ROLE_LABELS, ROLE_NAMES, type ModuleCode, type RoleName } from "@/lib/modules";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const cell = "border border-neutral-500 px-3 py-2";

const ROLE_BADGE: Record<string, string> = {
  SYSTEM_ADMIN: "bg-[#191e73] text-white",
  PRESIDENT: "bg-neutral-700 text-white",
  ADMISSION: "bg-[#2a78d6] text-white",
  REGISTRAR: "bg-[#e3e4f8] text-[#191e73]",
  GUIDANCE: "bg-green-600 text-white",
};

async function UsersRolesContent() {
  await connection();
  const currentUser = await requirePermission("users", "read");
  const canWrite = await hasPermission(currentUser.role, "users", "write");

  const [users, roles, assignments] = await Promise.all([
    prisma.tbl_user_account.findMany({
      orderBy: { created_at: "desc" },
      select: {
        user_id: true,
        full_name: true,
        username: true,
        email: true,
        is_active: true,
        created_at: true,
        tbl_role: { select: { role_name: true } },
      },
    }),
    prisma.tbl_role.findMany({
      select: { role_name: true, description: true, _count: { select: { tbl_user_account: true } } },
    }),
    prisma.tbl_role_permission.findMany({
      select: {
        tbl_role: { select: { role_name: true } },
        tbl_permission: { select: { permission_code: true } },
      },
    }),
  ]);

  const granted = new Set(
    assignments.map((a) => `${a.tbl_role.role_name}:${a.tbl_permission.permission_code}`),
  );

  const matrix = Object.fromEntries(
    ROLE_NAMES.map((role) => [
      role,
      Object.fromEntries(
        MODULES.map((m) => {
          let level: AccessLevel = "NONE";
          if (granted.has(`${role}:${m.code}_WRITE`)) level = "WRITE";
          else if (granted.has(`${role}:${m.code}_READ`)) level = "READ";
          return [m.code, level];
        }),
      ) as Record<ModuleCode, AccessLevel>,
    ]),
  );

  const roleRows = ROLE_NAMES.map((name) => {
    const record = roles.find((r) => r.role_name === name);
    return {
      role_name: name as RoleName,
      description: record?.description ?? null,
      accounts: record?._count.tbl_user_account ?? 0,
    };
  });

  const active = users.filter((u) => u.is_active).length;

  const accounts = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Accounts</h2>
        {canWrite && <CreateUserForm />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              {["Account", "Username", "Role", "Status", "Created"].map((h) => (
                <th key={h} className={`${cell} font-medium`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? (
              users.map((user) => {
                const role = user.tbl_role?.role_name;
                return (
                  <tr key={user.user_id} className="hover:bg-[#e3e4f8]/60">
                    <td className={cell}>
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-[#e3e4f8] text-sm font-semibold"
                        >
                          {user.full_name.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <span className="block font-medium">{user.full_name}</span>
                          <span className="block text-xs text-neutral-600">{user.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className={cell}>{user.username}</td>
                    <td className={cell}>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[role ?? ""] ?? "bg-neutral-200"}`}>
                        {role ? (ROLE_LABELS[role as RoleName] ?? role) : "Unassigned"}
                      </span>
                    </td>
                    <td className={cell}>
                      {user.is_active ? (
                        <span className="text-green-700">● Active</span>
                      ) : (
                        <span className="text-neutral-500">○ Inactive</span>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString("en-PH") : "--"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className={`${cell} py-10 text-center text-neutral-600`}>
                  No registered users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const permissions = (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Roles &amp; permissions</h2>
        <p className="text-sm text-neutral-700">
          What each role can do in every module. An account gets the access of its role.
        </p>
      </div>
      <RolePermissionEditor
        roles={roleRows}
        initial={matrix}
        canEdit={canWrite}
        currentRole={currentUser.role}
      />
    </section>
  );

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold">Users &amp; Roles</h1>
        <p className="text-sm text-neutral-700">System accounts and the module access of each role.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Accounts", value: users.length },
          { label: "Active accounts", value: active },
          { label: "Roles", value: ROLE_NAMES.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-500 bg-white/90 p-4">
            <p className="text-sm text-neutral-800">{stat.label}</p>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <ProfileTabs
        label="Users and roles sections"
        tabs={[
          { id: "accounts", label: "Accounts", content: accounts },
          { id: "permissions", label: "Roles & permissions", content: permissions },
        ]}
      />
    </div>
  );
}

export default function UsersRolesPage() {
  return (
    <Suspense fallback={null}>
      <UsersRolesContent />
    </Suspense>
  );
}
