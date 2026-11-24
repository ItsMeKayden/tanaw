"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ReauthModal } from "@/components/auth/reauth-modal";
import { apiPost, registerRecoveryHandler } from "@/lib/api-client";

type SessionDeadlines = {
  userId: string;
  expiresAt: string;
};

export function SessionExpirationGuard({ userId }: Readonly<{ userId: string }>) {
  const [deadlines, setDeadlines] = useState<SessionDeadlines | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const pendingResolve = useRef<((authenticated: boolean) => void) | null>(null);

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

  // Initial session fetch on mount
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

  // Sign out automatically when the 4-hour hard expiry is reached
  useEffect(() => {
    if (!deadlines) return;
    const expiry = Date.parse(deadlines.expiresAt);
    if (!Number.isFinite(expiry)) return;

    const delay = Math.max(0, expiry - Date.now());
    const timer = window.setTimeout(() => setReauthOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [deadlines]);

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

  return <ReauthModal open={reauthOpen} onComplete={completeReauthentication} />;
}
