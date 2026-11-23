"use client";

import { getCsrfToken, getSession, signOut } from "next-auth/react";

type RecoveryHandler = (userId: string) => Promise<boolean>;

type ApiRequestOptions = {
  userId: string;
  backup?: () => void;
};

let recoveryHandler: RecoveryHandler | null = null;
let recoveryPromise: Promise<boolean> | null = null;

export function registerRecoveryHandler(handler: RecoveryHandler) {
  recoveryHandler = handler;
  return () => {
    if (recoveryHandler === handler) recoveryHandler = null;
  };
}

async function postWithCsrf(url: string, init: RequestInit) {
  const csrfToken = await getCsrfToken();
  const headers = new Headers(init.headers);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);

  return fetch(url, {
    ...init,
    method: init.method ?? "POST",
    credentials: "same-origin",
    headers,
  });
}

export async function apiPost(
  url: string,
  init: RequestInit,
  { userId, backup }: ApiRequestOptions,
) {
  // Hold new API work while an expired session is being reauthenticated.
  if (recoveryPromise) await recoveryPromise;

  const response = await postWithCsrf(url, init);
  if (response.status !== 401) return response;

  backup?.();

  if (!recoveryPromise) {
    const handler = recoveryHandler;
    const activeRecovery = Promise.resolve(
      handler ? handler(userId) : false,
    )
      .then(Boolean, (error: unknown) => {
        console.error("Could not complete session reauthentication:", error);
        return false;
      });
    recoveryPromise = activeRecovery;
    void activeRecovery.then(() => {
      if (recoveryPromise === activeRecovery) recoveryPromise = null;
    });
  }

  const recovered = await recoveryPromise;
  if (!recovered) return response;

  const session = await getSession();
  if (session?.user?.id !== userId) {
    await signOut({ redirect: false });
    return new Response(
      JSON.stringify({ error: "Sign in with the account that started this request." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // One replay only: a second 401 is returned to the caller, never retried.
  return postWithCsrf(url, init);
}
