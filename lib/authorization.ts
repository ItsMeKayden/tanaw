import { auth } from "@/auth";
import { forbidden, redirect } from "next/navigation";
import {
  hasAnyPermission,
  hasPermission,
  type ModuleName,
  type Permission,
} from "@/lib/permissions";

export type UserRole =
  | "SYSTEM_ADMIN"
  | "PRESIDENT"
  | "ADMISSION"
  | "REGISTRAR"
  | "GUIDANCE";

export async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return session.user;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireUser();

  if (!allowedRoles.includes(user.role)) {
    forbidden();
  }

  return user;
}

export async function requirePermission(
  module: ModuleName,
  permission: Permission,
) {
  const user = await requireUser();

  const allowed = await hasPermission(user.role, module, permission);

  if (!allowed) {
    forbidden();
  }

  return user;
}

export async function requireAnyPermission(
  modules: ModuleName[],
  permission: Permission,
) {
  const user = await requireUser();

  const allowed = await hasAnyPermission(user.role, modules, permission);

  if (!allowed) {
    forbidden();
  }

  return user;
}

/**
 * Session user IDs are tbl_user_account.user_id values stored as strings.
 * Returns the numeric account ID for audit columns, or throws.
 */
export function getAccountId(user: { id?: string | null }): number {
  const accountId = Number(user.id);

  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new Error("Unauthorized. Please log in again.");
  }

  return accountId;
}
