import { Suspense } from "react";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { requireUser } from "@/lib/authorization";
import { ROLE_LABELS } from "@/lib/modules";
import { getNavigationItems } from "@/lib/navigation";

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  await connection();

  const user = await requireUser();

  const navigation = await getNavigationItems(user.role);

  return (
    <div className="flex min-h-screen flex-col bg-white text-black sm:flex-row">
      <Sidebar navigation={navigation} />
      <div className="flex min-h-[50vh] min-w-0 flex-1 flex-col sm:min-h-screen">
        <WorkspaceHeader
          navigation={navigation}
          userName={user.name || user.email || "Account"}
          roleLabel={ROLE_LABELS[user.role] ?? null}
        />
        <main className="m-2 flex-1 border border-neutral-400 print:m-0 print:border-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function WorkspaceFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-white sm:flex-row">
      <aside className="w-full shrink-0 bg-[#0d1b8c] sm:w-[230px]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-[58px] shrink-0 border-b border-neutral-500 bg-[#ededed]" />
        <main className="m-2 flex-1 border border-neutral-400" />
      </div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
