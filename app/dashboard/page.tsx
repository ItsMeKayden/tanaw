import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";

import { requireUser } from "@/lib/authorization";
import { hasPermission, type ModuleName } from "@/lib/permissions";
import { LogoutButton } from "@/features/auth/components/logout-button";

const modules: {
  name: string;
  description: string;
  href: string;
  permission: ModuleName;
}[] = [
  {
    name: "Admission",
    description: "Manage admission-related records and processes.",
    href: "/admission",
    permission: "admission",
  },
  {
    name: "Registrar",
    description: "Access registrar records and processes.",
    href: "/registrar",
    permission: "registrar",
  },
  {
    name: "Guidance",
    description: "Access guidance-related records and services.",
    href: "/guidance",
    permission: "guidance",
  },
  {
    name: "Reports",
    description: "View reports and system information.",
    href: "/reports",
    permission: "reports",
  },
];

function DashboardLoading() {
  return (
    <main className="min-h-screen p-8">
      <p className="text-muted-foreground">Loading dashboard...</p>
    </main>
  );
}

async function DashboardContent() {
  await connection();

  const user = await requireUser();

  const accessibleModules = modules.filter((module) =>
    hasPermission(user.role, module.permission, "read"),
  );

  return (
    <main className="min-h-screen p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">TANAW Dashboard</h1>

          <p className="mt-2 text-muted-foreground">
            Welcome, {user.name ?? user.email}!
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Role: {user.role}
          </p>
        </div>

        <LogoutButton />
      </header>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Your Modules</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Select a module to get started.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accessibleModules.map((module) => (
            <Link
              key={module.permission}
              href={module.href}
              className="rounded-lg border p-5 transition-colors hover:bg-accent"
            >
              <h3 className="font-semibold">{module.name}</h3>

              <p className="mt-2 text-sm text-muted-foreground">
                {module.description}
              </p>

              <p className="mt-4 text-sm font-medium">Open module →</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
