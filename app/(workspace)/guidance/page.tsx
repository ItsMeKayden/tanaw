import { connection } from "next/server";
import { ArrowUpRight, ClipboardCheck, Users } from "lucide-react";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { requirePermission } from "@/lib/authorization";

export default async function GuidancePage() {
  await connection();

  await requirePermission("guidance", "read");

  const stats = [
    { label: "Students assigned", value: "184", detail: "+12 this month" },
    { label: "Follow-ups", value: "37", detail: "8 needs review" },
    { label: "Advising sessions", value: "96", detail: "24 scheduled" },
  ];

  const supportStats = [
    { label: "Academic counseling", value: "72" },
    { label: "Career guidance", value: "43" },
    { label: "Personal concerns", value: "19" },
  ];

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />

      <div className="relative z-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Guidance
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
              Guidance Dashboard
            </h1>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">{item.label}</div>
                <div className="rounded-full bg-[#ecfdf5] p-2 text-green-700">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-bold text-neutral-900">{item.value}</div>
              <div className="mt-2 text-xs text-neutral-500">{item.detail}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <Users className="h-4 w-4 text-[#5a5ae8]" />
              Student support overview
            </div>
            <div className="space-y-3">
              {supportStats.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg bg-[#f5f5f5] px-3 py-2 text-sm"
                >
                  <span className="text-neutral-700">{item.label}</span>
                  <span className="font-semibold text-neutral-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <ClipboardCheck className="h-4 w-4 text-[#5a5ae8]" />
              Pending actions
            </div>
            <div className="space-y-3 text-sm text-neutral-700">
              <div className="rounded-lg border border-dashed border-neutral-300 p-3">
                8 students need follow-up counseling
              </div>
              <div className="rounded-lg border border-dashed border-neutral-300 p-3">
                4 recommendation packets awaiting review
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
