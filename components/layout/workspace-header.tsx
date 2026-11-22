"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { ChangePasswordModal } from "@/features/auth/components/change-password-modal";
import type { NavigationItem } from "@/lib/navigation";
import { findActiveHref, findTrail } from "@/lib/navigation-match";

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

/** Account name, then the avatar button whose menu holds Change password and Log out. */
function AccountMenu({ userName, roleLabel }: Readonly<{ userName: string; roleLabel: string | null }>) {
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden min-w-0 text-right leading-tight sm:block">
        <p className="max-w-[200px] truncate text-sm font-semibold text-black" title={userName}>
          {userName}
        </p>
        {roleLabel && <p className="text-xs text-neutral-600">{roleLabel}</p>}
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
              <div className="border-b border-neutral-100 px-3 pt-2 pb-2.5">
                <p className="truncate font-semibold">{userName}</p>
                {roleLabel && <p className="text-xs text-neutral-600">{roleLabel}</p>}
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

  const breadcrumb =
    findBreadcrumb(navigation, pathname) ??
    findTrail(navigation, findActiveHref(navigation, pathname)) ?? ["Dashboard"];

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-neutral-500 bg-[#D5D3FC] px-3 print:hidden">
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

      <AccountMenu userName={userName} roleLabel={roleLabel} />
    </header>
  );
}
