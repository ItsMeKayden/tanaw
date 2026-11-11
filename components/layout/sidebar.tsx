"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationItem } from "@/lib/navigation";

export function Sidebar({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-2 border-sky-500 bg-[#bdbdbd] sm:w-[138px]">
      <div className="flex h-[58px] items-center px-4 text-xs">
        QCU Admission
      </div>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap gap-1 px-3 pb-3 sm:flex-col"
      >
        {navigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-7 items-center px-2.5 text-xs ${
                isActive
                  ? "bg-[#a3a3a3] font-semibold"
                  : "hover:bg-[#adadad]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
