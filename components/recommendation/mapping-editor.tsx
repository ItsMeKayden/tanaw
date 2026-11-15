"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { resetMapping, saveMapping } from "@/features/recommendation/actions";
import { mappingFormSchema, type MappingFormValues } from "@/features/recommendation/schemas";

type Competency = { competency_id: number; label: string; name: string };
type Program = { program_id: number; program_code: string; program_name: string };

const cell = "border border-neutral-500 px-2 py-1.5";

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
            <tr className="bg-neutral-100 text-left">
              <th className={`${cell} font-medium`}>Course</th>
              {competencies.map((c) => (
                <th key={c.competency_id} className={`${cell} text-center font-medium`} title={c.name}>
                  {c.label}
                </th>
              ))}
              <th className={`${cell} text-center font-medium`}>Total</th>
              <th className={`${cell} text-center font-medium`}>Min. match</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const total = totalFor(program.program_id);
              const rowErrors = errors.rows?.[rowKey(program.program_id)] as
                | Record<string, FieldError | undefined>
                | undefined;
              return (
                <tr key={program.program_id}>
                  <td className={cell}>
                    <span className="font-medium">{program.program_name}</span>
                    <span className="block text-xs text-neutral-600">{program.program_code}</span>
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
                            className={`h-8 w-16 rounded-md border bg-white px-2 text-right tabular-nums disabled:border-transparent disabled:bg-transparent ${
                              error ? "border-red-500" : "border-neutral-400"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-600 italic">
          Each row must add up to 100%. Min. match is fixed at {minMatch}% for every course.
          Saving re-scores the active school year&apos;s recommendations.
        </p>
        {canWrite && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={isPending}
              className="rounded-md border border-neutral-500 bg-white px-4 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Reset to default
            </button>
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="rounded-md bg-neutral-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
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
