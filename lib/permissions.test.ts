import "dotenv/config";

import { canWrite, hasPermission } from "./permissions";
import type { UserRole } from "./authorization";
import type { ModuleName } from "./permissions";

const roles: UserRole[] = [
  "SYSTEM_ADMIN",
  "PRESIDENT",
  "ADMISSION",
  "REGISTRAR",
  "GUIDANCE",
];

const modules: ModuleName[] = [
  "dashboard",
  "map",
  "admission",
  "course",
  "users",
  "registrar",
  "guidance",
  "reports",
];

async function testPermissions() {
  for (const moduleName of modules) {
    console.log(`\n--- ${moduleName.toUpperCase()} ---`);

    for (const role of roles) {
      const canRead = await hasPermission(role, moduleName, "read");
      const canWritePermission = await canWrite(role, moduleName);

      console.log(`${role}: read=${canRead}, write=${canWritePermission}`);
    }
  }
}

testPermissions().catch((error) => {
  console.error("Permission test failed:", error);
  process.exitCode = 1;
});
