"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCsrfToken } from "next-auth/react";

import { ReauthModal } from "@/components/auth/reauth-modal";
import { Button } from "@/components/ui/button";
import { apiPost, registerRecoveryHandler } from "@/lib/api-client";
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_MS,
} from "@/lib/session-policy";

type SessionDeadlines = {
  userId: string;
  expiresAt: string;
  idleExpiresAt: string;
};

export function SessionExpirationGuard({ userId }: Readonly<{ userId: string }>) {
  const [deadlines, setDeadlines] = useState<SessionDeadlines | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const pendingResolve = useRef<((authenticated: boolean) => void) | null>(null);
  const lastActivityRefresh = useRef(0);

  const refresh = useCallback(async () => {
    const response = await apiPost(
      "/api/session/refresh",
      { cache: "no-store" },
      { userId },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as SessionDeadlines;
    if (result.userId !== userId) return false;
    setDeadlines(result);
    setWarningOpen(false);
    return true;
  }, [userId]);

  const requestReauthentication = useCallback(
    (ownerId: string) =>
      new Promise<boolean>((resolve) => {
        if (ownerId !== userId) {
          resolve(false);
          return;
        }
        pendingResolve.current = resolve;
        setReauthOpen(true);
      }),
    [userId],
  );

  useEffect(
    () => registerRecoveryHandler(requestReauthentication),
    [requestReauthentication],
  );

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refresh()
        .then((ok) => {
          if (active && !ok) setReauthOpen(true);
        })
        .catch((error: unknown) => {
          console.error("Could not refresh the session:", error);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!deadlines) return;
    const nextExpiry = Math.min(
      Date.parse(deadlines.expiresAt),
      Date.parse(deadlines.idleExpiresAt),
    );
    if (!Number.isFinite(nextExpiry)) return;

    const delay = Math.max(0, nextExpiry - Date.now() - SESSION_WARNING_MS);
    const timer = window.setTimeout(() => setWarningOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [deadlines]);

  useEffect(() => {
    const onActivity = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastActivityRefresh.current < SESSION_IDLE_TIMEOUT_MS / 4) return;
      lastActivityRefresh.current = Date.now();
      void refresh()
        .then((ok) => {
          if (!ok) setReauthOpen(true);
        })
        .catch((error: unknown) => {
          console.error("Could not refresh the active session:", error);
        });
    };
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [refresh]);

  async function keepSignedIn() {
    try {
      const csrf = await getCsrfToken();
      if (!csrf || !(await refresh())) setReauthOpen(true);
    } catch (error) {
      console.error("Could not extend the active session:", error);
      setReauthOpen(true);
    }
  }

  function completeReauthentication(authenticated: boolean) {
    setReauthOpen(false);
    const resolve = pendingResolve.current;
    pendingResolve.current = null;
    resolve?.(authenticated);
    if (authenticated) {
      void refresh().catch((error: unknown) => {
        console.error("Could not refresh the reauthenticated session:", error);
      });
    }
  }

  return (
    <>
      {warningOpen && !reauthOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-5 shadow-xl"
          >
            <h2 id="session-warning-title" className="font-semibold text-neutral-900">
              Your session is about to expire
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Continue now to keep working. Your admission draft is saved as you go.
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={keepSignedIn}>Keep me signed in</Button>
            </div>
          </section>
        </div>
      )}
      <ReauthModal open={reauthOpen} onComplete={completeReauthentication} />
    </>
  );
}