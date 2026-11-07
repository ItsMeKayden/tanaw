"use client";

import { usePathname } from "next/navigation";

import { LogoutButton } from "@/features/auth/components/logout-button";
import type { NavigationItem } from "@/lib/navigation";

export function WorkspaceHeader({
  navigation,
}: {
  navigation: NavigationItem[];
}) {
  const pathname = usePathname();
  const title =
    navigation.find((item) => item.href === pathname)?.label ?? "Dashboard";

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-neutral-500 bg-[#ededed] px-3">
      <h1 className="text-sm font-bold">{title}</h1>
      <LogoutButton />
    </header>
  );
}
