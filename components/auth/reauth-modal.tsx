"use client";

import { useState, type FormEvent } from "react";
import { getSession, signIn, signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAdmissionDraftOwner } from "@/lib/admission-draft-storage";

export function ReauthModal({
  open,
  onComplete,
}: Readonly<{
  open: boolean;
  onComplete: (authenticated: boolean) => void;
}>) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setPassword("");
        setError("Unable to re-authenticate with those credentials.");
        return;
      }
      const session = await getSession();
      if (!session?.user?.id) {
        await signOut({ redirect: false });
        setError("Sign in succeeded, but the session could not be verified.");
        return;
      }
      setAdmissionDraftOwner(session.user.id);
      setPassword("");
      onComplete(true);
    } catch {
      setError("Unable to re-authenticate. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl"
      >
        <h2 id="reauth-title" className="text-lg font-semibold text-neutral-900">
          Sign in to continue
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Your session expired. Your unsaved form data has been preserved.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="reauth-email">Email</Label>
            <Input
              id="reauth-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="reauth-password">Password</Label>
            <Input
              id="reauth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in and continue"}
          </Button>
        </form>
      </section>
    </div>
  );
}
