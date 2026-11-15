"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "tanaw:recommendation-advisory-seen";

/**
 * "Recommendations are a guide" notice. Shown once per browser session the
 * first time a recommendation page is opened.
 */
export function AdvisoryDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage unavailable (private mode): show it every time.
    }
    if (!seen) dialogRef.current?.showModal();
  }, []);

  function close() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="advisory-title"
      onCancel={close}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-neutral-400 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-3 p-6">
        <span className="inline-block rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium">
          Advisory
        </span>
        <h2 id="advisory-title" className="text-lg font-semibold">
          Recommendations are a guide
        </h2>
        <p className="text-sm text-neutral-700">
          The system suggests courses to support the admission process. Final
          admission and course placement follow the university&apos;s admission
          requirements and policies.
        </p>
        <p className="text-sm text-neutral-700">
          Please confirm any recommendation with the applicant before acting on it.
        </p>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={close}
            autoFocus
            className="rounded-lg bg-neutral-800 px-5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Small inline reminder shown on recommendation detail pages. */
export function AdvisoryNote() {
  return (
    <p className="rounded-lg border border-neutral-300 bg-white/80 px-3 py-2 text-xs text-neutral-700">
      <span className="font-semibold">Advisory:</span> recommendations are a guide. Final admission and
      course placement follow the university&apos;s admission requirements and policies.
    </p>
  );
}
