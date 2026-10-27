import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  hasPermission,
  type ModuleName,
  type Permission,
} from "@/lib/permissions";

export type UserRole = "PRESIDENT" | "ADMISSION" | "REGISTRAR" | "GUIDANCE";

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
    redirect("/dashboard");
  }

  return user;
}

export async function requirePermission(
  module: ModuleName,
  permission: Permission,
) {
  const user = await requireUser();

  if (!hasPermission(user.role, module, permission)) {
    redirect("/dashboard");
  }

  return user;
}
