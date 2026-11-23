"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { CalendarDays, ChevronDown, ChevronRight, KeyRound, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { navigationIcons } from "@/components/layout/navigation-icons";
import { ChangePasswordModal } from "@/features/auth/components/change-password-modal";
import type { NavigationItem } from "@/lib/navigation";
import { findActiveHref } from "@/lib/navigation-match";

/** Navigation items from the top-level section down to the one whose href matches. */
function findItemTrail(
  items: NavigationItem[],
  href: string | null,
  parents: NavigationItem[] = [],
): NavigationItem[] | null {
  if (!href) return null;

  for (const item of items) {
    const trail = [...parents, item];
    if (item.href === href) return trail;
    if (item.children) {
      const found = findItemTrail(item.children, href, trail);
      if (found) return found;
    }
  }

  return null;
}

const todayFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Plain profile glyph: white head and shoulders in a navy circle. */
function AccountAvatar() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <defs>
        <clipPath id="account-avatar-clip">
          <circle cx="16" cy="16" r="16" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="16" fill="#191e73" />
      <g clipPath="url(#account-avatar-clip)" fill="white">
        <circle cx="16" cy="12.5" r="5.5" />
        <ellipse cx="16" cy="28" rx="10" ry="8" />
      </g>
    </svg>
  );
}

function RolePill({ roleLabel }: Readonly<{ roleLabel: string }>) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#e3e4f8] px-2 py-px text-[11px] font-medium text-[#191e73]">
      {roleLabel}
    </span>
  );
}

/** Account name, then the avatar button whose menu holds Change password and Log out. */
function AccountMenu({ userName, roleLabel }: Readonly<{ userName: string; roleLabel: string | null }>) {
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden min-w-0 flex-col items-end gap-0.5 leading-tight sm:flex">
        <p className="max-w-[200px] truncate text-sm font-semibold text-black" title={userName}>
          {userName}
        </p>
        {roleLabel && <RolePill roleLabel={roleLabel} />}
      </div>

      <Menu.Root>
        <Menu.Trigger
          aria-label={`Account menu for ${userName}`}
          className="group flex cursor-pointer items-center gap-0.5 rounded-full p-0.5 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#191e73]/40 data-[popup-open]:bg-black/5"
        >
          <AccountAvatar />
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 text-neutral-600 transition-transform group-data-[popup-open]:rotate-180"
          />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
            <Menu.Popup className="min-w-52 rounded-xl border border-neutral-200 bg-white p-1 text-sm text-black shadow-lg outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              {/* Name repeated here so it's visible on phones, where the header hides it. */}
              <div className="space-y-1 border-b border-neutral-100 px-3 pt-2 pb-2.5">
                <p className="truncate font-semibold">{userName}</p>
                {roleLabel && <RolePill roleLabel={roleLabel} />}
              </div>
              <Menu.Item
                onClick={() => setChangingPassword(true)}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none select-none data-[highlighted]:bg-neutral-100"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                Change password
              </Menu.Item>
              <Menu.Item
                onClick={() => signOut({ callbackUrl: "/auth/login" })}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-red-700 outline-none select-none data-[highlighted]:bg-red-50"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Log out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}

export function WorkspaceHeader({
  navigation,
  userName,
  roleLabel,
}: Readonly<{
  navigation: NavigationItem[];
  userName: string;
  roleLabel: string | null;
}>) {
  const pathname = usePathname();

  // An exact match wins; otherwise the closest page above this one
  // (e.g. /admission/applicants/12 belongs to Applicant).
  const trail = findItemTrail(navigation, pathname) ??
    findItemTrail(navigation, findActiveHref(navigation, pathname)) ?? [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard" },
    ];

  const current = trail[trail.length - 1];
  const parents = trail.slice(0, -1);
  const SectionIcon = trail[0].icon ? navigationIcons[trail[0].icon] : null;

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-neutral-300 bg-white px-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:px-4 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        {SectionIcon && (
          <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-[#e3e4f8] text-[#191e73] sm:flex">
            <SectionIcon className="size-[18px]" aria-hidden="true" />
          </div>
        )}

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 flex-col leading-tight">
            {parents.length > 0 && (
              <li className="flex min-w-0 items-center gap-1 text-xs text-neutral-500">
                {parents.map((item, index) => (
                  <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                    {index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
                    {item.href ? (
                      <Link href={item.href} className="truncate hover:text-[#191e73] hover:underline">
                        {item.label}
                      </Link>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </span>
                ))}
                <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              </li>
            )}
            <li className="truncate text-base font-bold text-[#191e73]" aria-current="page">
              {current.label}
            </li>
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p className="hidden items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600 md:flex">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span suppressHydrationWarning>{todayFormat.format(new Date())}</span>
        </p>
        <span className="hidden h-8 w-px bg-neutral-200 md:block" aria-hidden="true" />
        <AccountMenu userName={userName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
