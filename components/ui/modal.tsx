"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-md",
  lg: "max-w-5xl",
} as const;

/**
 * Centered modal dialog (Base UI Dialog): focus is trapped inside, Escape
 * closes it, and the page behind is inert. The body (px-5 / py-4) scrolls
 * without a visible scrollbar when the content is taller than the viewport.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "lg",
  dismissible = true,
  flush = false,
  zIndex = "z-50",
  children,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZES;
  /** false = clicking the backdrop does not close it (forms with unsaved input). */
  dismissible?: boolean;
  /**
   * true = the body has no padding or scrolling; the content lays out its
   * own scroll area and footer (it gets a flex column that fills the modal).
   */
  flush?: boolean;
  /** Stacking layer class for nested modals (defaults to "z-50"). */
  zIndex?: string;
  children: ReactNode;
}>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={!dismissible}>
      <Dialog.Portal>
        <Dialog.Backdrop className={`fixed inset-0 ${zIndex} bg-neutral-950/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0`} />
        <Dialog.Popup
          className={`fixed top-1/2 left-1/2 ${zIndex} flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] ${SIZES[size]} -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white text-black shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)] ring-1 ring-black/10 outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg leading-tight font-semibold text-[#191e73]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 truncate text-sm text-neutral-600">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mt-0.5 -mr-1.5 shrink-0 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black focus-visible:ring-2 focus-visible:ring-[#191e73]/30 focus-visible:outline-none"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          {flush ? (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          ) : (
            <div className="scrollbar-none overflow-x-hidden overflow-y-auto px-5 py-4">{children}</div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
