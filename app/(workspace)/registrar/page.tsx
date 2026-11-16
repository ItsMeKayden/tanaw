import { connection } from "next/server";
import { BriefcaseBusiness, ChevronRight, FileText, GraduationCap } from "lucide-react";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { requirePermission } from "@/lib/authorization";

export default async function RegistrarPage() {
  await connection();

  await requirePermission("registrar", "read");

  const cards = [
    { label: "Enrolled students", value: "1,248", icon: GraduationCap },
    { label: "Records processed", value: "3,416", icon: FileText },
    { label: "Pending validation", value: "42", icon: BriefcaseBusiness },
  ];

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />

      <div className="relative z-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Registrar
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
              Registrar Dashboard
            </h1>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {cards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">{label}</div>
                <div className="rounded-full bg-[#eef2ff] p-2 text-[#4f46e5]">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-bold text-neutral-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold text-neutral-700">
              <span>Academic records</span>
              <span className="flex items-center gap-1 text-[#4f46e5]">
                View all <ChevronRight className="h-4 w-4" />
              </span>
            </div>
            <div className="space-y-3">
              {["Student profiles updated", "Enrollment verification cleared", "Academic standing reviewed"].map(
                (item) => (
                  <div
                    key={item}
                    className="rounded-lg bg-[#f5f5f5] px-3 py-2 text-sm text-neutral-700"
                  >
                    {item}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-300 bg-white/85 p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-neutral-700">Action center</div>
            <div className="space-y-3 text-sm text-neutral-700">
              <div className="rounded-lg border border-dashed border-neutral-300 p-3">
                12 missing transcript attachments
              </div>
              <div className="rounded-lg border border-dashed border-neutral-300 p-3">
                9 records pending release approval
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
