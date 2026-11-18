"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

/*
 * Visible feedback while a filter or link loads new server data. Inside a
 * <PendingProvider>, <PendingLink> and navigate() run the navigation in a
 * transition, and every <PendingArea> dims with an "Updating…" badge until
 * the new data arrives. Outside a provider they behave like normal links.
 */

type PendingContext = { isPending: boolean; navigate: (href: string) => void };

const Context = createContext<PendingContext | null>(null);

export function PendingProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  return <Context.Provider value={{ isPending, navigate }}>{children}</Context.Provider>;
}

/** navigate(href) with the shared pending state, or a plain push outside a provider. */
export function useNavigate() {
  const context = useContext(Context);
  const router = useRouter();
  return context?.navigate ?? ((href: string) => router.push(href));
}

export function PendingLink({
  href,
  className,
  title,
  style,
  "aria-current": ariaCurrent,
  children,
}: Readonly<{
  href: string;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  "aria-current"?: "true";
  children: ReactNode;
}>) {
  const context = useContext(Context);
  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      style={style}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        // Keep new-tab clicks and other modifiers working normally.
        if (!context || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        context.navigate(href);
      }}
    >
      {children}
    </Link>
  );
}

/** Dims its content and shows an "Updating…" badge while a navigation is pending. */
export function PendingArea({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  const isPending = useContext(Context)?.isPending ?? false;
  return (
    <div className={`relative ${className}`}>
      <div className="pending-area" aria-busy={isPending}>
        {children}
      </div>
      <span
        aria-hidden={!isPending}
        className={`pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-full border border-[#9fa3e0] bg-white px-2.5 py-1 text-xs font-medium text-[#191e73] shadow-sm transition-opacity ${
          isPending ? "opacity-100" : "opacity-0"
        }`}
      >
        <LoaderCircle className="size-3.5 animate-spin" />
        Updating…
      </span>
    </div>
  );
}
