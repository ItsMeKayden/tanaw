// Role labels as edited on the User Management page (server only — imports
// Prisma). Falls back to the built-in labels in lib/modules.ts.
import { ROLE_LABELS, ROLE_NAMES, type RoleName } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

export type RoleLabels = Record<RoleName, string>;

export async function getRoleLabels(): Promise<RoleLabels> {
  const roles = await prisma.tbl_role.findMany({ select: { role_name: true, display_name: true } });
  const edited = new Map(roles.map((r) => [r.role_name, r.display_name?.trim()]));
  return Object.fromEntries(
    ROLE_NAMES.map((name) => [name, edited.get(name) || ROLE_LABELS[name]]),
  ) as RoleLabels;
}
