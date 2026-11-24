"use client";

export function updateAdmissionFormUrl(
  mode: "create" | "edit",
  applicantId: number | undefined,
  step: number,
  isModal: boolean,
) {
  const url = new URL(window.location.href);
  if (isModal) {
    url.searchParams.set(
      "admissionForm",
      mode === "create" ? "create" : `edit-${applicantId}`,
    );
  } else {
    url.searchParams.delete("admissionForm");
  }
  url.searchParams.set("step", String(step));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function clearAdmissionFormUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("admissionForm");
  url.searchParams.delete("step");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function parseAdmissionStep(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 3) : 0;
}
