"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { NavigationItem } from "@/lib/navigation";

export function Sidebar({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname();

  const [expandedItems, setExpandedItems] = useState<string[]>(() =>
    navigation
      .filter((item) =>
        item.children?.some(
          (child) =>
            child.href === pathname ||
            child.children?.some((nested) => nested.href === pathname),
        ),
      )
      .map((item) => item.label),
  );

  function toggleItem(label: string) {
    setExpandedItems((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  }

  function renderNavigation(items: NavigationItem[], depth = 0) {
    return items.map((item) => {
      const hasChildren = Boolean(item.children?.length);
      const isExpanded = expandedItems.includes(item.label);
      const isActive = item.href === pathname;
      const isParentActive = item.children?.some(
        (child) =>
          child.href === pathname ||
          child.children?.some((nested) => nested.href === pathname),
      );

      return (
        <div key={`${depth}-${item.label}`} className="w-full">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleItem(item.label)}
              aria-expanded={isExpanded}
              className={`flex min-h-8 w-full items-center justify-between px-2.5 text-left text-xs ${
                isParentActive
                  ? "bg-[#a3a3a3] font-semibold"
                  : "hover:bg-[#adadad]"
              }`}
              style={{ paddingLeft: `${10 + depth * 12}px` }}
            >
              {item.label}
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          ) : (
            item.href && (
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-8 w-full items-center px-2.5 text-xs ${
                  isActive ? "bg-[#a3a3a3] font-semibold" : "hover:bg-[#adadad]"
                }`}
                style={{ paddingLeft: `${10 + depth * 12}px` }}
              >
                {item.label}
              </Link>
            )
          )}

          {hasChildren && isExpanded && (
            <div className="w-full">
              {renderNavigation(item.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <aside className="w-full shrink-0 border-2 border-sky-500 bg-[#bdbdbd] sm:w-[180px]">
      <div className="flex h-[58px] items-center px-4 text-xs">
        QCU Admission
      </div>

      <nav
        aria-label="Main navigation"
        className="flex flex-col gap-1 px-3 pb-3"
      >
        {renderNavigation(navigation)}
      </nav>
    </aside>
  );
}
