import { Suspense } from "react";
import { connection } from "next/server";
import { requirePermission } from "@/lib/authorization";
import Link from "next/link";

function ReportsLoading() {
  return (
    <main className="min-h-screen p-8">
      <p className="text-muted-foreground">Loading Reports page...</p>
    </main>
  );
}

async function ReportsContent() {
  await connection();

  const user = await requirePermission("reports", "read");

  return (
    <main className="min-h-screen p-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold">Reports</h1>

      <p className="mt-2">Welcome, {user.name ?? user.email}!</p>

      <p className="mt-1 text-sm text-muted-foreground">Role: {user.role}</p>
    </main>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReportsContent />
    </Suspense>
  );
}
