import { Suspense } from "react";
import { auth } from "@/auth";
import { getRoleLandingPath } from "@/lib/auth-navigation";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { LoginForm } from "./login-form";

async function LoginRoute() {
  await connection();
  const session = await auth();

  if (session?.user) {
    redirect(getRoleLandingPath(session.user.role));
  }

  return <LoginForm />;
}

function LoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <p role="status" className="text-sm text-neutral-600">
        Checking sign-in...
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginRoute />
    </Suspense>
  );
}
