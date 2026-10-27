import { Suspense } from "react";
import { connection } from "next/server";
import { requirePermission } from "@/lib/authorization";
import Link from "next/link";

function AdmissionLoading() {
  return (
    <main className="min-h-screen p-8">
      <p className="text-muted-foreground">Loading Admission page...</p>
    </main>
  );
}

async function AdmissionContent() {
  await connection();

  const user = await requirePermission("admission", "read");

  return (
    <main className="min-h-screen p-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold">Admission</h1>

      <p className="mt-2">Welcome, {user.name ?? user.email}!</p>

      <p className="mt-1 text-sm text-muted-foreground">Role: {user.role}</p>
    </main>
  );
}

export default function AdmissionPage() {
  return (
    <Suspense fallback={<AdmissionLoading />}>
      <AdmissionContent />
    </Suspense>
  );
}
