"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function ProfileTabs({
  tabs,
  label = "Sections",
}: Readonly<{ tabs: { id: string; label: string; content: ReactNode }[]; label?: string }>) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-2 print:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`rounded-full border px-4 py-1 text-sm transition-colors ${
              active === tab.id
                ? "border-[#191e73] bg-[#191e73] font-semibold text-white"
                : "border-neutral-500 bg-white hover:bg-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          // Every panel prints, even the inactive ones.
          className={active === tab.id ? "" : "hidden print:block"}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-neutral-500 bg-white px-5 py-1 text-sm hover:bg-neutral-100 print:hidden"
    >
      Print
    </button>
  );
}
