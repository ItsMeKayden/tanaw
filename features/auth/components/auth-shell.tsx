import Image from "next/image";
import type { ReactNode } from "react";

import qcuLogo from "@/app/public/qcu-logo.png";

/** Input styling shared by the sign-in and password pages. */
export const authInputClass =
  "h-[31px] rounded-none border border-[#a3a3a3] bg-white px-2 text-xs placeholder:text-[#c7c7c7] focus-visible:border-[#171d70] focus-visible:ring-1 focus-visible:ring-[#171d70]/30";

export const authButtonClass =
  "h-[29px] w-full rounded-none bg-[#191e73] p-0 text-xs font-normal text-white hover:bg-[#191e73]";

/** Two-panel layout of the auth pages: university seal on the left, form on the right. */
export function AuthShell({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
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
          <h2 className="mb-3 text-xl font-normal leading-6 text-black">{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}
