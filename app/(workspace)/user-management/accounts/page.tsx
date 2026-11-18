import { Suspense } from "react";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { UserAccounts } from "@/components/user-management/user-accounts";
import { getRoleLabels } from "@/features/user-management/role-labels";
import { getAccountId, requirePermission } from "@/lib/authorization";
import { ROLE_NAMES, type RoleName } from "@/lib/modules";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TablePageSkeleton } from "@/components/ui/skeletons";

async function UserAccountsContent() {
  await connection();
  const currentUser = await requirePermission("users", "read");

  const [canWrite, users, roleLabels] = await Promise.all([
    hasPermission(currentUser.role, "users", "write"),
    prisma.tbl_user_account.findMany({
      orderBy: { created_at: "desc" },
      select: {
        user_id: true,
        full_name: true,
        email: true,
        is_active: true,
        created_at: true,
        tbl_role: { select: { role_name: true } },
      },
    }),
    getRoleLabels(),
  ]);

  const active = users.filter((u) => u.is_active).length;

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <div>
        <h1 className="text-2xl font-bold">User Accounts</h1>
        <p className="text-sm text-neutral-700">Create and manage system accounts and the role each one has.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Accounts", value: users.length },
          { label: "Active accounts", value: active },
          { label: "Inactive accounts", value: users.length - active },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-500 bg-white/90 p-4">
            <p className="text-sm text-neutral-800">{stat.label}</p>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <UserAccounts
        accounts={users.map((user) => ({
          user_id: user.user_id,
          full_name: user.full_name,
          email: user.email,
          role: (ROLE_NAMES as readonly string[]).includes(user.tbl_role?.role_name ?? "")
            ? (user.tbl_role!.role_name as RoleName)
            : null,
          is_active: user.is_active === true,
          created_at: user.created_at?.toISOString() ?? null,
        }))}
        canWrite={canWrite}
        currentUserId={getAccountId(currentUser)}
        currentRole={currentUser.role}
        roleLabels={roleLabels}
      />
    </div>
  );
}

export default function UserAccountsPage() {
  return (
    <Suspense fallback={<TablePageSkeleton label="user accounts" stats={3} cols={5} />}>
      <UserAccountsContent />
    </Suspense>
  );
}
