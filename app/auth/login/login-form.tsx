"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Cinzel } from "next/font/google";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleLandingPath, getSafeReturnUrl } from "@/lib/auth-navigation";
import { setAdmissionDraftOwner } from "@/lib/admission-draft-storage";
import qcuLogo from "@/public/qcu-logo.png";
import qcuGate from "@/public/qcu-gate.jpg";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<"registered" | "reset" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // One-time notices from ?registered=true / ?reset=true. Read after mount
  // (the server has no URL to match, so reading it while rendering breaks
  // hydration), then removed from the address so a reload doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("reset") === "true" ? "reset" : params.get("registered") === "true" ? "registered" : null;
    if (!next) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    setNotice(next);
    params.delete("reset");
    params.delete("registered");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  async function handleSubmit() {
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
        setError("Invalid email or password.");
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      const role = session?.user?.role;
      if (typeof session?.user?.id === "string") {
        setAdmissionDraftOwner(session.user.id);
      }
      const returnUrl = getSafeReturnUrl(
        new URLSearchParams(window.location.search).get("returnUrl"),
      );

      router.replace(returnUrl ?? getRoleLandingPath(role));
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[60%_40%]">
      {/* Left side: Full background gate photo with royal blue gradient overlay */}
      <section className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-[#101763] px-6 py-12 text-center text-white lg:min-h-screen lg:px-12 lg:rounded-r-[22px] lg:shadow-[10px_0_30px_rgba(11,14,54,0.12)]">
        {/* Full background gate image covering entire left side */}
        <div className="pointer-events-none absolute inset-0 z-0 select-none">
          <Image
            src={qcuGate}
            alt="Quezon City University Gate"
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            priority
            className="object-cover object-center opacity-80 mix-blend-luminosity"
          />
          {/* Royal blue to midnight navy gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#18239c]/80 via-[#131a78]/80 to-[#0b0e36]/90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(37,65,245,0.35)_0%,transparent_65%)]" />
        </div>

        {/* Branding Content */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Circular QCU Seal */}
          <div className="relative mb-5 flex size-[120px] items-center justify-center rounded-full bg-white p-1.5 shadow-[0_0_40px_rgba(255,255,255,0.35)] ring-2 ring-[#e5b842]/80 sm:size-[140px] lg:size-[155px]">
            <Image
              src={qcuLogo}
              alt="Quezon City University official seal"
              priority
              className="size-full object-contain"
            />
          </div>

          {/* Golden Serif Typography: QUEZON CITY UNIVERSITY */}
          <h1
            className={`${cinzel.className} text-xl font-semibold tracking-[0.16em] text-[#e6b944] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-2xl lg:text-[27px]`}
          >
            QUEZON CITY UNIVERSITY
          </h1>

          {/* White Serif Typography: ADMISSION */}
          <p
            className={`${cinzel.className} mt-2 text-3xl font-normal tracking-[0.26em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-4xl lg:text-[44px]`}
          >
            ADMISSION
          </p>
        </div>
      </section>

      {/* Right side: Clean white background with QCU TANAW logo and sign-in card */}
      <section className="flex flex-col items-center justify-center bg-white px-8 py-12 sm:px-12 lg:min-h-screen">
        <div className="w-full max-w-[340px]">
          {/* QCU TANAW Logo (Large) */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex items-center">
              {/* Q with integrated typographic tail & embedded QCU Seal (Large Size) */}
              <div className="relative flex size-[64px] sm:size-[72px] items-center justify-center select-none">
                <svg
                  viewBox="0 0 54 54"
                  className="size-full overflow-visible"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {/* Q ring */}
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    stroke="#171d70"
                    strokeWidth="5.5"
                  />
                  {/* Q tail: bold stroke sweeping seamlessly out of the ring */}
                  <path
                    d="M 31 31 L 45 45"
                    stroke="#171d70"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Symmetrically Centered QCU Seal within the Q's counter */}
                <div className="absolute inset-0 m-auto right-0.5 flex size-[44px] sm:size-[52px] items-center justify-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm">
                  <Image
                    src={qcuLogo}
                    alt="QCU Seal"
                    priority
                    className="size-full object-contain"
                  />
                </div>
              </div>

              {/* CU - closely adjacent to Q without gap */}
              <span className="-ml-2 font-sans text-[58px] sm:text-[66px] font-black leading-none tracking-tight text-[#171d70]">
                CU
              </span>
            </div>

            {/* TANAW */}
            <span className="mt-2 font-sans text-base sm:text-lg font-black tracking-[0.35em] text-[#171d70] uppercase">
              TANAW
            </span>

            {/* Horizontal divider below QCU TANAW logo */}
            <div className="mt-6 h-px w-full max-w-[280px] bg-gray-200" />
          </div>

          {/* Sign In Form */}
          <div className="w-full">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              Sign in
            </h2>

            {notice === "registered" && (
              <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                Account created successfully. You can now sign in.
              </p>
            )}
            {notice === "reset" && (
              <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                Your password was reset. Sign in with your new password.
              </p>
            )}

            <form action={handleSubmit} className="space-y-4">
              <div>
                <Label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold text-gray-700"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="name@qcu.edu.ph"
                  className="h-10 rounded-md border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#2541f5] focus:ring-2 focus:ring-[#2541f5]/20"
                  required
                />
              </div>

              <div>
                <Label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-semibold text-gray-700"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="******"
                  className="h-10 rounded-md border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#2541f5] focus:ring-2 focus:ring-[#2541f5]/20"
                  required
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="mt-2 h-10 w-full rounded-md bg-[#2541f5] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1b34cd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2541f5]"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-[#2541f5] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
