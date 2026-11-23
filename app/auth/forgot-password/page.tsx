"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/features/auth/actions/reset-password";
import { AuthShell, authButtonClass, authInputClass } from "@/features/auth/components/auth-shell";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await requestPasswordReset({ email: String(formData.get("email") ?? "") });
      if (result.success) setSent(result.message);
      else setError(result.message);
    });
  }

  return (
    <AuthShell title="Forgot password">
      {sent ? (
        <p role="status" className="mb-4 border border-green-300 bg-green-50 p-2 text-xs text-green-800">
          {sent}
        </p>
      ) : (
        <form action={handleSubmit}>
          <p className="mb-3 text-xs text-neutral-600">
            Enter the email you sign in with and we&apos;ll send you a link to choose a new password.
          </p>
          <div className="mb-4">
            <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-gray-700">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@qcu.edu.ph"
              className={authInputClass}
              required
            />
          </div>

          {error && (
            <p role="alert" className="mb-3 border border-red-300 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" className={authButtonClass} disabled={isPending}>
            {isPending ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
      )}

      <Link
        href="/auth/login"
        className="mt-4 block text-center text-xs text-[#191e73] underline-offset-2 hover:underline"
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
