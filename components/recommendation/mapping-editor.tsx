"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { resetMapping, saveMapping } from "@/features/recommendation/actions";
import { mappingFormSchema, type MappingFormValues } from "@/features/recommendation/schemas";
import { toast } from "@/components/ui/toaster";

type Competency = { competency_id: number; label: string; name: string };
type Program = { program_id: number; program_code: string; program_name: string; min_match: number };

const cell = "border border-neutral-500 px-2 py-1";
const headCell = `${cell} bg-[#b4b7f3] py-2 text-center font-medium`;

// Prefixed keys so React Hook Form doesn't treat numeric ids as array indexes.
const rowKey = (programId: number) => `p${programId}`;
const colKey = (competencyId: number) => `c${competencyId}`;

export default function MappingEditor({
  programs,
  competencies,
  initial,
  initialRules,
  canWrite,
}: Readonly<{
  programs: Program[];
  competencies: Competency[];
  /** program_id → competency_id → weight */
  initial: Record<number, Record<number, number>>;
  /** program_id → competency_id → minimum subject score (compatibility rule) */
  initialRules: Record<number, Record<number, number | null>>;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const toFormValues = (): MappingFormValues => ({
    minMatch: Object.fromEntries(programs.map((p) => [rowKey(p.program_id), String(p.min_match)])),
    rules: Object.fromEntries(
      programs.map((p) => [
        rowKey(p.program_id),
        Object.fromEntries(
          competencies.map((c) => {
            const min = initialRules[p.program_id]?.[c.competency_id];
            return [colKey(c.competency_id), min == null ? "" : String(min)];
          }),
        ),
      ]),
    ),
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
  const ruleValues = useWatch({ control, name: "rules" }) ?? {};

  // After a save/reset the server sends fresh weights; resync the form.
  const [synced, setSynced] = useState({ initial, initialRules, programs });
  if (synced.initial !== initial || synced.initialRules !== initialRules || synced.programs !== programs) {
    setSynced({ initial, initialRules, programs });
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
            min_match: Number(values.minMatch[rowKey(p.program_id)]),
            weights: competencies.map((c) => {
              const rule = values.rules[rowKey(p.program_id)]?.[colKey(c.competency_id)]?.trim() ?? "";
              return {
                competency_id: c.competency_id,
                weight: Number(values.rows[rowKey(p.program_id)][colKey(c.competency_id)]),
                min_score: rule === "" ? null : Number(rule),
              };
            }),
          })),
        );
        toast.fromResult(result);
        setFeedback("error" in result ? { ok: false, text: result.error } : null);
        router.refresh();
      });
    },
    () =>
      setFeedback({
        ok: false,
        text: "Fix the highlighted cells: weights, minimum match and subject minimums must be 0–100, and each row's weights must add up to 100%.",
      }),
  );

  function restoreDefaults() {
    if (
      !window.confirm(
        "Restore the default weights and minimum match for every course and clear all subject minimums? Your changes will be replaced.",
      )
    )
      return;
    setFeedback(null);
    startTransition(async () => {
      const result = await resetMapping();
      toast.fromResult(result);
      setFeedback("error" in result ? { ok: false, text: result.error } : null);
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
              const minError = errors.minMatch?.[rowKey(program.program_id)] as FieldError | undefined;
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
                            className={`h-7 w-14 rounded-sm border bg-white px-1.5 text-center tabular-nums outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20 disabled:border-transparent disabled:bg-transparent ${
                              error ? "border-red-500 bg-red-50" : "border-neutral-300"
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
                  <td className={`${cell} text-center`}>
                    <div className="inline-flex items-center gap-0.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={1}
                        {...register(`minMatch.${rowKey(program.program_id)}`)}
                        disabled={!canWrite || isPending}
                        aria-label={`${program.program_code} minimum match`}
                        aria-invalid={Boolean(minError)}
                        title={minError?.message}
                        className={`h-7 w-14 rounded-sm border bg-white px-1.5 text-center tabular-nums outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20 disabled:border-transparent disabled:bg-transparent ${
                          minError ? "border-red-500 bg-red-50" : "border-neutral-300"
                        }`}
                      />
                      <span className="text-xs text-neutral-600">%</span>
                    </div>
                    {minError && <span className="block text-[10px] text-red-600">{minError.message}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 pt-3">
        <div>
          <h3 className="text-base font-semibold">Compatibility rules</h3>
          <p className="text-xs text-neutral-600">
            Minimum exam score per subject for each course. Leave a cell blank for no minimum. An applicant is
            &ldquo;Compatible&rdquo; with their preferred course only when they meet every minimum and the course&apos;s
            minimum match. Advisory only: it never changes an applicant&apos;s admission stage.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white/90 text-sm">
            <thead>
              <tr>
                <th className={`${headCell} text-left`}>Course</th>
                {competencies.map((c) => (
                  <th key={c.competency_id} className={headCell} title={c.name}>
                    {c.label} min.
                  </th>
                ))}
                <th className={headCell}>Rules</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => {
                const ruleErrors = errors.rules?.[rowKey(program.program_id)] as
                  | Record<string, FieldError | undefined>
                  | undefined;
                const ruleCount = competencies.filter(
                  (c) => (ruleValues[rowKey(program.program_id)]?.[colKey(c.competency_id)] ?? "").trim() !== "",
                ).length;
                return (
                  <tr key={program.program_id} className="hover:bg-[#e3e4f8]/50">
                    <td className={`${cell} px-3`} title={program.program_code}>
                      {program.program_name}
                    </td>
                    {competencies.map((c) => {
                      const error = ruleErrors?.[colKey(c.competency_id)];
                      return (
                        <td key={c.competency_id} className={`${cell} text-center`}>
                          <div className="inline-flex items-center gap-0.5">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step={1}
                              placeholder="–"
                              {...register(`rules.${rowKey(program.program_id)}.${colKey(c.competency_id)}`)}
                              disabled={!canWrite || isPending}
                              aria-label={`${program.program_code} minimum ${c.name} score`}
                              aria-invalid={Boolean(error)}
                              title={error?.message}
                              className={`h-7 w-14 rounded-sm border bg-white px-1.5 text-center tabular-nums outline-none placeholder:text-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20 disabled:border-transparent disabled:bg-transparent ${
                                error ? "border-red-500 bg-red-50" : "border-neutral-300"
                              }`}
                            />
                            <span className="text-xs text-neutral-600">%</span>
                          </div>
                          {error && <span className="block text-[10px] text-red-600">{error.message}</span>}
                        </td>
                      );
                    })}
                    <td className={`${cell} text-center text-xs text-neutral-600 tabular-nums`}>
                      {ruleCount === 0 ? "None" : `${ruleCount} of ${competencies.length}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="min-w-0 max-w-3xl text-xs text-neutral-600">
          Each course&apos;s weights must add up to 100%. <strong>Min. match</strong> is the course match the
          preferred course needs to be &ldquo;Compatible&rdquo;, and the score required on each weighted competency.
          <span className="block text-neutral-500">Saving re-scores the active school year&apos;s recommendations.</span>
        </p>
        {canWrite && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={isPending}
              className="h-9 rounded-md border border-neutral-500 bg-white px-4 text-sm whitespace-nowrap hover:bg-neutral-100 disabled:opacity-50"
            >
              Reset to default
            </button>
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="h-9 rounded-md bg-[#191e73] px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-[#232a99] disabled:opacity-50"
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
