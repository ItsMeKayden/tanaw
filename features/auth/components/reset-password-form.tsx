"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/features/auth/actions/reset-password";
import { authButtonClass, authInputClass } from "@/features/auth/components/auth-shell";

const LOGIN_AFTER_RESET = "/auth/login?reset=true";
const REDIRECT_DELAY_MS = 3000;

export function ResetPasswordForm({ token }: Readonly<{ token: string }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  // Show the confirmation for a moment, then go to sign in.
  useEffect(() => {
    if (!doneMessage) return;
    router.prefetch(LOGIN_AFTER_RESET);
    const timer = window.setTimeout(() => router.replace(LOGIN_AFTER_RESET), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doneMessage, router]);

  function handleSubmit(formData: FormData) {
    setError("");
    setFieldErrors({});
    startTransition(async () => {
      const result = await resetPassword({
        token,
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      });
      if (result.success) {
        setDoneMessage(result.message);
        return;
      }
      if (result.fieldErrors && Object.keys(result.fieldErrors).some((f) => f !== "token")) {
        setFieldErrors(result.fieldErrors);
      } else {
        setError(result.message);
      }
    });
  }

  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <p id={`${name}-error`} className="mt-0.5 text-[11px] text-red-700">
        {fieldErrors[name]}
      </p>
    ) : null;

  if (doneMessage) {
    return (
      <div role="status">
        <p className="mb-3 border border-green-300 bg-green-50 p-2 text-xs text-green-800">
          {doneMessage}
        </p>
        <p className="mb-4 text-xs text-neutral-600">Taking you to the sign-in page...</p>
        <Link
          href={LOGIN_AFTER_RESET}
          replace
          className={`${authButtonClass} flex items-center justify-center`}
        >
          Sign In Now
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit}>
      <div className="mb-2">
        <Label htmlFor="newPassword" className="mb-0.5 block text-xs font-normal text-black">
          New password
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          placeholder="At least 8 characters"
          aria-invalid={Boolean(fieldErrors.newPassword)}
          aria-describedby={fieldErrors.newPassword ? "newPassword-error" : undefined}
          className={authInputClass}
          required
        />
        {fieldError("newPassword")}
      </div>

      <div className="mb-[22px]">
        <Label htmlFor="confirmPassword" className="mb-0.5 block text-xs font-normal text-black">
          Confirm new password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
          aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
          className={authInputClass}
          required
        />
        {fieldError("confirmPassword")}
      </div>

      {error && (
        <div role="alert" className="mb-3 border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          {error}{" "}
          <Link href="/auth/forgot-password" className="underline">
            Request a new link
          </Link>
        </div>
      )}

      <Button type="submit" className={authButtonClass} disabled={isPending}>
        {isPending ? "Saving..." : "Reset Password"}
      </Button>
    </form>
  );
}
