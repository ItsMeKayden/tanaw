import { canWrite, hasPermission } from "./permissions";
import type { UserRole } from "./authorization";
import type { ModuleName } from "./permissions";

const roles: UserRole[] = ["PRESIDENT", "ADMISSION", "REGISTRAR", "GUIDANCE"];

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

for (const moduleName of modules) {
  console.log(`\n--- ${moduleName.toUpperCase()} ---`);

  for (const role of roles) {
    console.log(
      `${role}: read=${hasPermission(role, moduleName, "read")}, write=${canWrite(role, moduleName)}`,
    );
  }
}
