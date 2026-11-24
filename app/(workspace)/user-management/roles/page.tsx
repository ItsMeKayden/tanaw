import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import RolePermissionEditor from "@/components/user-management/role-permission-editor";
import { getRoleLabels } from "@/features/user-management/role-labels";
import type { AccessLevel } from "@/features/user-management/schemas";
import { requireRole } from "@/lib/authorization";
import { MODULES, ROLE_NAMES, type ModuleCode, type RoleName } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { GridEditorSkeleton } from "@/components/ui/skeletons";

async function RolesContent() {
  await connection();
  const currentUser = await requireRole(["SYSTEM_ADMIN"]);

  const [roles, assignments, roleLabels] = await Promise.all([
    prisma.tbl_role.findMany({
      select: { role_name: true, description: true, _count: { select: { tbl_user_account: true } } },
    }),
    prisma.tbl_role_permission.findMany({
      select: {
        tbl_role: { select: { role_name: true } },
        tbl_permission: { select: { permission_code: true } },
      },
    }),
    getRoleLabels(),
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
      label: roleLabels[name],
      description: record?.description ?? null,
      accounts: record?._count.tbl_user_account ?? 0,
    };
  });

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold">Roles &amp; Permissions</h1>
        <p className="text-sm text-neutral-700">
          What each role can do in every module. An account gets the access of its role.
        </p>
      </div>

      <RolePermissionEditor roles={roleRows} initial={matrix} canEdit currentRole={currentUser.role} />
    </div>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<GridEditorSkeleton label="roles and permissions" cols={9} rows={5} />}>
      <RolesContent />
    </Suspense>
  );
}
