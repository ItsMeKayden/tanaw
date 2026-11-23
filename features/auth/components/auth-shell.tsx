import Image from "next/image";
import type { ReactNode } from "react";
import { Cinzel } from "next/font/google";

import qcuLogo from "@/public/qcu-logo.png";
import qcuGate from "@/public/qcu-gate.jpg";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Input styling shared by the sign-in and password pages. */
export const authInputClass =
  "h-10 rounded-md border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#2541f5] focus:ring-2 focus:ring-[#2541f5]/20";

export const authButtonClass =
  "h-10 w-full rounded-md bg-[#2541f5] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1b34cd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2541f5]";

/** Two-panel layout of the auth pages: university seal on the left, form on the right. */
export function AuthShell({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[60%_40%]">
      <section className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-[#101763] px-6 py-12 text-center text-white lg:min-h-screen lg:rounded-r-[22px] lg:px-12 lg:shadow-[10px_0_30px_rgba(11,14,54,0.12)]">
        <div className="pointer-events-none absolute inset-0 z-0 select-none">
          <Image
            src={qcuGate}
            alt="Quezon City University Gate"
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            priority
            className="object-cover object-center opacity-80 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#18239c]/80 via-[#131a78]/80 to-[#0b0e36]/90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(37,65,245,0.35)_0%,transparent_65%)]" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-5 flex size-[120px] items-center justify-center rounded-full bg-white p-1.5 shadow-[0_0_40px_rgba(255,255,255,0.35)] ring-2 ring-[#e5b842]/80 sm:size-[140px] lg:size-[155px]">
            <Image
              src={qcuLogo}
              alt="Quezon City University official seal"
              priority
              className="size-full object-contain"
            />
          </div>
          <h1 className={`${cinzel.className} text-xl font-semibold tracking-[0.16em] text-[#e6b944] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-2xl lg:text-[27px]`}>
            QUEZON CITY UNIVERSITY
          </h1>
          <p className={`${cinzel.className} mt-2 text-3xl font-normal tracking-[0.26em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-4xl lg:text-[44px]`}>
            ADMISSION
          </p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center bg-white px-8 py-12 sm:px-12 lg:min-h-screen">
        <div className="w-full max-w-[340px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex items-center">
              <div className="relative flex size-[64px] items-center justify-center select-none sm:size-[72px]">
                <svg viewBox="0 0 54 54" className="size-full overflow-visible" fill="none" aria-hidden="true">
                  <circle cx="26" cy="26" r="22" stroke="#171d70" strokeWidth="5.5" />
                  <path d="M 31 31 L 45 45" stroke="#171d70" strokeWidth="7" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 right-0.5 m-auto flex size-[44px] items-center justify-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm sm:size-[52px]">
                  <Image src={qcuLogo} alt="QCU Seal" priority className="size-full object-contain" />
                </div>
              </div>
              <span className="-ml-2 font-sans text-[58px] font-black leading-none tracking-tight text-[#171d70] sm:text-[66px]">
                CU
              </span>
            </div>
            <span className="mt-2 font-sans text-base font-black tracking-[0.35em] text-[#171d70] uppercase sm:text-lg">
              TANAW
            </span>
            <div className="mt-6 h-px w-full max-w-[280px] bg-gray-200" />
          </div>

          <h2 className="mb-4 text-xl font-bold text-gray-900">{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}
