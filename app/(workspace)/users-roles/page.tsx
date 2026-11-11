import { connection } from "next/server";

import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/users-roles/create-user-form";
import { UserPermissionMatrix } from "@/components/users-roles/user-permission-matrix";
import { hasPermission } from "@/lib/permissions";

export default async function UsersRolesPage() {
  await connection();

  const currentUser = await requirePermission("users", "read");

  const canCreateUsers = await hasPermission(
    currentUser.role,
    "users",
    "write",
  );

  const users = await prisma.tbl_user_account.findMany({
    select: {
      user_id: true,
      full_name: true,
      username: true,
      email: true,
      is_active: true,
      created_at: true,
      tbl_role: {
        select: {
          role_name: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return (
    <section className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">User Access and Roles</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View system accounts and their assigned module permissions.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total registered users:{" "}
          <span className="font-semibold text-foreground">{users.length}</span>
        </p>

        {canCreateUsers && <CreateUserForm />}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Account Permission Matrix
        </h2>

        <UserPermissionMatrix users={users} />
      </div>
    </section>
  );
}
