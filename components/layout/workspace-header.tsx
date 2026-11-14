"use client";

import { usePathname } from "next/navigation";

import { LogoutButton } from "@/features/auth/components/logout-button";
import type { NavigationItem } from "@/lib/navigation";

function findBreadcrumb(
  items: NavigationItem[],
  pathname: string,
  parents: string[] = [],
): string[] | null {
  for (const item of items) {
    const currentPath = [...parents, item.label];

    if (item.href === pathname) {
      return currentPath;
    }

    if (item.children) {
      const result = findBreadcrumb(item.children, pathname, currentPath);

      if (result) return result;
    }
  }

  return null;
}

export function WorkspaceHeader({
  navigation,
}: {
  navigation: NavigationItem[];
}) {
  const pathname = usePathname();

  const breadcrumb = findBreadcrumb(navigation, pathname) ?? ["Dashboard"];

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-neutral-500 bg-[#ededed] px-3">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {breadcrumb.map((label, index) => (
            <li key={`${label}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span className="text-neutral-500">&gt;</span>}

              <span
                className={
                  index === breadcrumb.length - 1
                    ? "font-bold text-black"
                    : "text-neutral-500"
                }
                aria-current={
                  index === breadcrumb.length - 1 ? "page" : undefined
                }
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <LogoutButton />
    </header>
  );
}
