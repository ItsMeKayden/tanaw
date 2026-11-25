"use client";

import type { ComponentProps } from "react";

/** A filter dropdown that applies itself: changing it submits its form (no Apply button). */
export function AutoSubmitSelect(props: Readonly<ComponentProps<"select">>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
