import Link from "next/link";
import { Suspense } from "react";

import { isResetTokenValid } from "@/features/auth/actions/reset-password";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

type ResetPasswordSearchParams = Promise<{ token?: string | string[] }>;

async function ResetPasswordContent({ searchParams }: Readonly<{ searchParams: ResetPasswordSearchParams }>) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  if (!(await isResetTokenValid(value))) {
    return (
      <>
        <p role="alert" className="mb-4 border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          This reset link is invalid or has expired. Links work once and expire after 1 hour.
        </p>
        <Link
          href="/auth/forgot-password"
          className="block text-center text-xs text-[#191e73] underline-offset-2 hover:underline"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return <ResetPasswordForm token={value} />;
}

export default function ResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: ResetPasswordSearchParams }>) {
  return (
    <AuthShell title="Reset password">
      <Suspense fallback={<p className="text-xs text-neutral-600">Checking your link...</p>}>
        <ResetPasswordContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
