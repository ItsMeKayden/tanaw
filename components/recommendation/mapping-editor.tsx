"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { resetMapping, saveMapping } from "@/features/recommendation/actions";
import { mappingFormSchema, type MappingFormValues } from "@/features/recommendation/schemas";

type Competency = { competency_id: number; label: string; name: string };
type Program = { program_id: number; program_code: string; program_name: string };

const cell = "border border-neutral-500 px-2 py-1";
const headCell = `${cell} bg-[#b4b7f3] py-2 text-center font-medium`;

// Prefixed keys so React Hook Form doesn't treat numeric ids as array indexes.
const rowKey = (programId: number) => `p${programId}`;
const colKey = (competencyId: number) => `c${competencyId}`;

export default function MappingEditor({
  programs,
  competencies,
  initial,
  minMatch,
  canWrite,
}: Readonly<{
  programs: Program[];
  competencies: Competency[];
  /** program_id → competency_id → weight */
  initial: Record<number, Record<number, number>>;
  minMatch: number;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const toFormValues = (): MappingFormValues => ({
    rows: Object.fromEntries(
      programs.map((p) => [
        rowKey(p.program_id),
        Object.fromEntries(
          competencies.map((c) => [colKey(c.competency_id), String(initial[p.program_id]?.[c.competency_id] ?? 0)]),
        ),
      ]),
    ),
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: toFormValues(),
    mode: "onChange",
  });
  const rows = useWatch({ control, name: "rows" }) ?? {};

  // After a save/reset the server sends fresh weights; resync the form.
  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (syncedInitial !== initial) {
    setSyncedInitial(initial);
    reset(toFormValues());
  }

  const totalFor = (programId: number) =>
    Math.round(
      competencies.reduce((sum, c) => sum + (Number(rows[rowKey(programId)]?.[colKey(c.competency_id)]) || 0), 0) * 100,
    ) / 100;

  const save = handleSubmit(
    (values) => {
      setFeedback(null);
      startTransition(async () => {
        const result = await saveMapping(
          programs.map((p) => ({
            program_id: p.program_id,
            weights: competencies.map((c) => ({
              competency_id: c.competency_id,
              weight: Number(values.rows[rowKey(p.program_id)][colKey(c.competency_id)]),
            })),
          })),
        );
        setFeedback("error" in result ? { ok: false, text: result.error } : { ok: true, text: result.message });
        router.refresh();
      });
    },
    () =>
      setFeedback({
        ok: false,
        text: "Fix the highlighted cells: every weight must be 0–100 and each row must add up to 100%.",
      }),
  );

  function restoreDefaults() {
    if (!window.confirm("Restore the default weights for every course? Your changes will be replaced.")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await resetMapping();
      setFeedback("error" in result ? { ok: false, text: result.error } : { ok: true, text: result.message });
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} noValidate className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white/90 text-sm">
          <thead>
            <tr>
              <th className={`${headCell} text-left`}>Course</th>
              {competencies.map((c) => (
                <th key={c.competency_id} className={headCell} title={c.name}>
                  {c.label}
                </th>
              ))}
              <th className={headCell}>Total</th>
              <th className={headCell}>Min. match</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const total = totalFor(program.program_id);
              const rowErrors = errors.rows?.[rowKey(program.program_id)] as
                | Record<string, FieldError | undefined>
                | undefined;
              return (
                <tr key={program.program_id} className="hover:bg-[#e3e4f8]/50">
                  <td className={`${cell} px-3`} title={program.program_code}>
                    {program.program_name}
                  </td>
                  {competencies.map((c) => {
                    const error = rowErrors?.[colKey(c.competency_id)];
                    return (
                      <td key={c.competency_id} className={`${cell} text-center`}>
                        <div className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={1}
                            {...register(`rows.${rowKey(program.program_id)}.${colKey(c.competency_id)}`)}
                            disabled={!canWrite || isPending}
                            aria-label={`${program.program_code} ${c.name} weight`}
                            aria-invalid={Boolean(error)}
                            title={error?.message}
                            className={`h-7 w-14 rounded-sm border bg-transparent px-1.5 text-center tabular-nums outline-none hover:border-neutral-400 focus:border-[#191e73] focus:bg-white focus:ring-2 focus:ring-[#191e73]/20 disabled:hover:border-transparent ${
                              error ? "border-red-500 bg-red-50" : "border-transparent"
                            }`}
                          />
                          <span className="text-xs text-neutral-600">%</span>
                        </div>
                        {error && <span className="block text-[10px] text-red-600">{error.message}</span>}
                      </td>
                    );
                  })}
                  <td className={`${cell} text-center font-semibold tabular-nums ${total === 100 ? "text-green-700" : "text-red-700"}`}>
                    {total}%{total !== 100 && <span className="sr-only"> (must be 100%)</span>}
                  </td>
                  <td className={`${cell} text-center text-neutral-600 tabular-nums`}>{minMatch}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-xs text-neutral-600 italic">
          Each row must add up to 100%.
          <span className="block not-italic text-neutral-500">
            Min. match is fixed at {minMatch}% for every course. Saving re-scores the active school year&apos;s recommendations.
          </span>
        </p>
        {canWrite && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={isPending}
              className="h-8 rounded-md border border-neutral-500 bg-neutral-200 px-4 text-sm hover:bg-neutral-300 disabled:opacity-50"
            >
              Reset to default
            </button>
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="h-8 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save mapping"}
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-lg border p-3 text-sm ${
            feedback.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </form>
  );
}
