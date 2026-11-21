"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, authButtonClass, authInputClass } from "@/features/auth/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const search = typeof window !== "undefined" ? window.location.search : "";

  return (
    <AuthShell title="Sign in">
      {search.includes("registered=true") && (
        <p className="mb-4 border border-gray-300 p-2 text-xs text-gray-700">
          Account created successfully. You can now sign in.
        </p>
      )}
      {search.includes("reset=true") && (
        <p role="status" className="mb-4 border border-green-300 bg-green-50 p-2 text-xs text-green-800">
          Your password was reset. Sign in with your new password.
        </p>
      )}

      <form action={handleSubmit}>
        <div className="mb-2">
          <Label htmlFor="email" className="mb-0.5 block text-xs font-normal text-black">
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

        <div className="mb-[22px]">
          <div className="mb-0.5 flex items-baseline justify-between">
            <Label htmlFor="password" className="block text-xs font-normal text-black">
              Password
            </Label>
            <Link
              href="/auth/forgot-password"
              className="text-[11px] text-[#191e73] underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="******"
            className={authInputClass}
            required
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3 border border-red-300 bg-red-50 p-2 text-xs text-red-700"
          >
            {error}
          </p>
        )}

        <Button type="submit" className={authButtonClass} disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </AuthShell>
  );
}
