/**
 * reset-rbac.ts
 *
 * One-shot script: wipes all role-permission assignments and re-applies
 * DEFAULT_ROLE_ACCESS from lib/modules.ts.
 *
 * Run with:
 *   npx tsx prisma/seeds/reset-rbac.ts
 */
import "dotenv/config";

import { DEFAULT_ROLE_ACCESS, MODULES, ROLE_NAMES, type RoleName } from "../../lib/modules";
import { prisma } from "./client";

const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
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

async function main() {
  console.log("🔄 Resetting role-permission assignments…");

  // 1. Delete all existing assignments.
  const deleted = await prisma.tbl_role_permission.deleteMany({});
  console.log(`   Removed ${deleted.count} existing assignment(s).`);

  // 2. Ensure roles and permissions exist, then assign per DEFAULT_ROLE_ACCESS.
  for (const roleName of ROLE_NAMES) {
    const role = await prisma.tbl_role.upsert({
      where: { role_name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { role_name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });

    const accessMap = DEFAULT_ROLE_ACCESS[roleName];

    for (const moduleInfo of MODULES) {
      const types = accessMap[moduleInfo.code] ?? [];
      for (const type of types) {
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

        await prisma.tbl_role_permission.upsert({
          where: {
            role_id_permission_id: {
              role_id: role.role_id,
              permission_id: permission.permission_id,
            },
          },
          update: {},
          create: {
            role_id: role.role_id,
            permission_id: permission.permission_id,
          },
        });
        console.log(`   ✅ ${roleName} → ${code}`);
      }
    }
  }

  console.log("✅ RBAC reset complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
