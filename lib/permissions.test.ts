import { canWrite, hasPermission } from "./permissions";
import type { UserRole } from "./authorization";
import type { ModuleName } from "./permissions";

const roles: UserRole[] = ["PRESIDENT", "ADMISSION", "REGISTRAR", "GUIDANCE"];

const modules: ModuleName[] = [
  "dashboard",
  "admission",
  "registrar",
  "guidance",
  "reports",
];

for (const module of modules) {
  console.log(`\n--- ${module.toUpperCase()} ---`);

  for (const role of roles) {
    console.log(
      `${role}: read=${hasPermission(role, module, "read")}, write=${canWrite(role, module)}`,
    );
  }
}
