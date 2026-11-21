"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  MapPinned,
  School,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import qcuLogo from "@/app/public/qcu-logo.png";
import type { NavigationIcon, NavigationItem } from "@/lib/navigation";
import { containsHref, findActiveHref } from "@/lib/navigation-match";

const icons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutGrid,
  map: MapPinned,
  admission: School,
  analytics: ChartColumn,
  recommendation: GraduationCap,
  users: UserRound,
};

export function Sidebar({ navigation }: Readonly<{ navigation: NavigationItem[] }>) {
  const pathname = usePathname();
  const activeHref = findActiveHref(navigation, pathname);

  // Groups containing the current page start expanded.
  const [expanded, setExpanded] = useState<string[]>(() => {
    const open: string[] = [];
    const visit = (items: NavigationItem[]) => {
      for (const item of items) {
        if (item.children && containsHref(item, activeHref)) {
          open.push(item.label);
          visit(item.children);
        }
      }
    };
    visit(navigation);
    return open;
  });

  function toggle(label: string) {
    setExpanded((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  }

  function renderTopLevel(item: NavigationItem) {
    const Icon = item.icon ? icons[item.icon] : null;
    const isActive = containsHref(item, activeHref);
    const isOpen = expanded.includes(item.label);
    const hasChildren = Boolean(item.children?.length);

    const content = (
      <>
        {Icon && <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2} />}
        <span className="flex-1 truncate text-left">{item.label}</span>
        {(hasChildren || isActive) && (
          <ChevronRight
            aria-hidden="true"
            className={`size-4 shrink-0 opacity-80 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        )}
      </>
    );

    const className = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? "bg-white/25 font-semibold" : "text-white/90 hover:bg-white/10 hover:text-white"
    }`;

    return (
      <li key={item.label}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(item.label)}
            aria-expanded={isOpen}
            className={className}
          >
            {content}
          </button>
        ) : (
          item.href && (
            <Link
              href={item.href}
              aria-current={item.href === activeHref ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          )
        )}

        {hasChildren && isOpen && renderChildren(item.children!, 1)}
      </li>
    );
  }

  function renderChildren(items: NavigationItem[], depth: number) {
    return (
      <ul
        className={`mt-1 mb-1 space-y-0.5 border-l border-white/30 ${depth === 1 ? "ml-[21px]" : "ml-3"}`}
      >
        {items.map((child) => {
          const isActive = child.href === activeHref;
          const hasChildren = Boolean(child.children?.length);
          const isOpen = expanded.includes(child.label);
          const isParentActive = containsHref(child, activeHref);
          const className = `flex w-full items-center gap-2 rounded-r-lg py-1.5 pr-2 pl-3 text-left text-[13px] transition-colors ${
            isActive
              ? "bg-white/25 font-semibold"
              : `hover:bg-white/10 ${isParentActive ? "font-semibold" : "text-white/85"}`
          }`;

          return (
            <li key={child.label}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggle(child.label)}
                  aria-expanded={isOpen}
                  className={className}
                >
                  <span className="flex-1">{child.label}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className={`size-3.5 opacity-80 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>
              ) : (
                child.href && (
                  <Link
                    href={child.href}
                    aria-current={isActive ? "page" : undefined}
                    className={className}
                  >
                    {child.label}
                  </Link>
                )
              )}
              {hasChildren && isOpen && renderChildren(child.children!, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <aside className="scrollbar-none w-full shrink-0 bg-[#0d1b8c] text-white sm:sticky sm:top-0 sm:h-screen sm:w-[230px] sm:overflow-y-auto print:hidden">
      <div className="flex items-center gap-3 px-4 py-3 sm:flex-col sm:gap-1 sm:pt-5 sm:pb-5">
        <Image
          src={qcuLogo}
          alt="Quezon City University seal"
          priority
          className="size-12 rounded-full sm:size-20"
        />
        <div className="sm:text-center">
          <p className="text-2xl leading-none font-black tracking-wide sm:text-[32px]">
            QCU
          </p>
          <p className="text-[10px] font-extrabold tracking-[0.25em] text-white/90 [-webkit-text-stroke:0.5px_#0d1b8c] [text-shadow:0_0_1px_#fff]">
            TANAW
          </p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="px-2 pb-4">
        <ul className="space-y-0.5">{navigation.map(renderTopLevel)}</ul>
      </nav>
    </aside>
  );
}
