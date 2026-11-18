import { redirect } from "next/navigation";

// User Management is a sidebar group; its home opens User Accounts.
export default function UserManagementPage() {
  redirect("/user-management/accounts");
}
