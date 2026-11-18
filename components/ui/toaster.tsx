"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

/*
 * App-wide notifications. Call toast.success / toast.error / toast.info from
 * any client component after an action; <Toaster /> (mounted once in the
 * workspace layout) shows them in the top-right corner, under the header.
 */

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };

const DURATION: Record<ToastType, number> = { success: 4000, info: 4000, error: 7000 };
const MAX_VISIBLE = 4;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(type: ToastType, message: string) {
  if (!message) return;
  toasts = [...toasts, { id: nextId++, type, message }].slice(-MAX_VISIBLE);
  emit();
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  /** Success or error from a server action result shaped { error } | { message }. */
  fromResult: (result: { error: string } | { message: string }) =>
    "error" in result ? push("error", result.error) : push("success", result.message),
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => toasts;
// Must return the same array every time (a new [] per call makes React loop).
const NO_TOASTS: Toast[] = [];
const getServerSnapshot = () => NO_TOASTS;

const STYLE: Record<ToastType, { box: string; icon: typeof CircleCheck; iconClass: string }> = {
  success: { box: "border-green-300", icon: CircleCheck, iconClass: "text-green-600" },
  error: { box: "border-red-300", icon: CircleAlert, iconClass: "text-red-600" },
  info: { box: "border-[#9fa3e0]", icon: Info, iconClass: "text-[#191e73]" },
};

function ToastItem({ item }: Readonly<{ item: Toast }>) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), DURATION[item.type]);
    return () => window.clearTimeout(timer);
  }, [item]);

  const { box, icon: Icon, iconClass } = STYLE[item.type];
  return (
    <li
      role={item.type === "error" ? "alert" : "status"}
      className={`toast-enter pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-sm text-neutral-900 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] ${box}`}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-full p-1 text-neutral-500 hover:bg-neutral-100 hover:text-black"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <ol
      aria-label="Notifications"
      className="pointer-events-none fixed top-[4.5rem] right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2 print:hidden"
    >
      {items.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </ol>
  );
}
