import { hash } from "bcryptjs";

import {
  DEFAULT_ROLE_ACCESS,
  MODULES,
  ROLE_NAMES,
  type PermissionType,
} from "../../lib/modules";
import { log, prisma, warn } from "./client";

const ROLE_DESCRIPTIONS: Record<(typeof ROLE_NAMES)[number], string> = {
  SYSTEM_ADMIN:
    "The one who manages accounts and can see the audit logs in their dashboard. Has full access to User Management only, and no access to other modules.",
  PRESIDENT:
    "The one who oversees all data in QCU, so they can only access 3 modules: Dashboard, Map, and Analytics & Reports. All view-only, except that they can export reports.",
  ADMISSION:
    "The one who handles applicants and admission operations. Can view, create, update, soft delete, and export applicant records, has full access to the Map, and can create/export custom reports from admission data. View-only access to Course Recommendation.",
  GUIDANCE:
    "The one who advises applicants. Can update exam results and advising notes only, has full access to Course Recommendation, and can view and export exams and course analytics.",
  REGISTRAR:
    "The one who handles enrollment. Can update enrollment status only, see enrolled status on the dashboard, and can view and export enrollment data and reports.",
};

const PERMISSION_TYPES: PermissionType[] = ["READ", "WRITE"];

/**
 * Roles, module permissions, and role-permission assignments.
 *
 * Default access (lib/modules.ts) is applied only to permissions that have no
 * assignments yet, so changes made on the User Management page are kept when
 * the seed runs again. SYSTEM_ADMIN always keeps full access.
 */
export async function seedRolesAndPermissions() {
  const roleIds = new Map<string, number>();
  for (const roleName of ROLE_NAMES) {
    const record = await prisma.tbl_role.upsert({
      where: { role_name: roleName },
      // Descriptions are only set on create; edits from User Management are kept.
      update: {},
      create: { role_name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });
    roleIds.set(roleName, record.role_id);
  }

  let permissionCount = 0;
  let defaultsApplied = 0;

  for (const moduleInfo of MODULES) {
    for (const type of PERMISSION_TYPES) {
      const code = `${moduleInfo.code}_${type}`;
      const permission = await prisma.tbl_permission.upsert({
        where: { permission_code: code },
        update: { module_name: moduleInfo.code },
        create: {
          permission_code: code,
          module_name: moduleInfo.code,
          description: `${type} access for the ${moduleInfo.code} module.`,
        },
      });
      permissionCount++;

      const assigned = await prisma.tbl_role_permission.count({
        where: { permission_id: permission.permission_id },
      });

      const roles =
        assigned === 0
          ? ROLE_NAMES.filter((role) =>
              DEFAULT_ROLE_ACCESS[role][moduleInfo.code]?.includes(type),
            )
          : (["SYSTEM_ADMIN"] as const); // never lock the administrator out

      for (const role of roles) {
        await prisma.tbl_role_permission.upsert({
          where: {
            role_id_permission_id: {
              role_id: roleIds.get(role)!,
              permission_id: permission.permission_id,
            },
          },
          update: {},
          create: { role_id: roleIds.get(role)!, permission_id: permission.permission_id },
        });
      }
      if (assigned === 0) defaultsApplied++;
    }
  }

  log(
    "access",
    `${ROLE_NAMES.length} roles, ${permissionCount} permissions (${defaultsApplied} given default access)`,
  );
}

/**
 * The initial SYSTEM_ADMIN account. Never changes an existing account's
 * password. Skipped (with a warning) when SYSTEM_ADMIN_PASSWORD is not set.
 */
export async function seedSystemAdmin() {
  const username = "systemadmin";
  const email = "systemadmin@tanaw.com";

  const existing = await prisma.tbl_user_account.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { user_id: true },
  });

  if (existing) {
    log("access", "SYSTEM_ADMIN account already exists (password unchanged)");
    return;
  }

  const password = process.env.SYSTEM_ADMIN_PASSWORD;
  if (!password || password.length < 8 || password.length > 72) {
    warn("access", "SYSTEM_ADMIN not created — set SYSTEM_ADMIN_PASSWORD (8–72 characters) in .env and re-run.");
    return;
  }

  const role = await prisma.tbl_role.findUniqueOrThrow({ where: { role_name: "SYSTEM_ADMIN" } });

  await prisma.tbl_user_account.create({
    data: {
      username,
      email,
      full_name: "System Admin",
      password_hash: await hash(password, 12),
      role_id: role.role_id,
      is_active: true,
    },
  });

  log("access", `SYSTEM_ADMIN account created (${email})`);
}

export const TEST_USERS = [
  { name: "TANAW Test President", email: "test.president@example.com", role: "PRESIDENT" },
  { name: "TANAW Test Admission", email: "test.admission@example.com", role: "ADMISSION" },
  { name: "TANAW Test Registrar", email: "test.registrar@example.com", role: "REGISTRAR" },
  { name: "TANAW Test Guidance", email: "test.guidance@example.com", role: "GUIDANCE" },
] as const;

/**
 * One test account per role (development only). Re-running resets their
 * passwords to TEST_USER_PASSWORD. Skipped when the variable is not set.
 */
export async function seedTestUsers() {
  if (process.env.NODE_ENV === "production") {
    log("access", "Test accounts skipped (production)");
    return;
  }

  const password = process.env.TEST_USER_PASSWORD;
  if (!password || password.length < 8 || password.length > 72) {
    warn("access", "Test accounts not created — set TEST_USER_PASSWORD (8–72 characters) in .env to create them.");
    return;
  }

  const passwordHash = await hash(password, 12);

  for (const user of TEST_USERS) {
    const role = await prisma.tbl_role.findUniqueOrThrow({ where: { role_name: user.role } });
    const data = {
      email: user.email,
      full_name: user.name,
      password_hash: passwordHash,
      role_id: role.role_id,
      is_active: true,
    };
    await prisma.tbl_user_account.upsert({
      where: { username: user.email },
      update: data,
      create: { username: user.email, ...data },
    });
  }

  log("access", `${TEST_USERS.length} test accounts ready (password = TEST_USER_PASSWORD)`);
}
