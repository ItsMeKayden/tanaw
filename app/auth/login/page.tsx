"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import qcuLogo from "../../public/qcu-logo.png";

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

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[58.8%_41.2%]">
      <section className="flex min-h-[360px] flex-col items-center justify-center bg-[#a3a3a3] px-6 py-12 text-center text-white lg:min-h-screen">
        <div className="flex flex-col items-center">
          <div className="mb-3 flex size-[136px] items-center justify-center overflow-hidden rounded-full bg-white">
            <Image
              src={qcuLogo}
              alt="Quezon City University seal"
              priority
              className="size-full object-cover"
            />
          </div>
          <h1 className="text-[38px] font-normal leading-tight">
            Quezon City University
          </h1>
          <p className="mt-4 text-2xl leading-tight">
            Admission
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[281px]">
          <h2 className="mb-3 text-xl font-normal leading-6 text-black">
            Sign in
          </h2>

          {typeof window !== "undefined" &&
            window.location.search.includes("registered=true") && (
              <p className="mb-4 border border-gray-300 p-2 text-xs text-gray-700">
                Account created successfully. You can now sign in.
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
                className="h-[31px] rounded-none border border-[#a3a3a3] bg-white px-2 text-xs placeholder:text-[#c7c7c7] focus-visible:border-[#171d70] focus-visible:ring-1 focus-visible:ring-[#171d70]/30"
                required
              />
            </div>

            <div className="mb-[22px]">
              <Label htmlFor="password" className="mb-0.5 block text-xs font-normal text-black">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="******"
                className="h-[31px] rounded-none border border-[#a3a3a3] bg-white px-2 text-xs placeholder:text-[#c7c7c7] focus-visible:border-[#171d70] focus-visible:ring-1 focus-visible:ring-[#171d70]/30"
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

            <Button
              type="submit"
              className="h-[29px] w-full rounded-none bg-[#191e73] p-0 text-xs font-normal text-white hover:bg-[#191e73]"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
