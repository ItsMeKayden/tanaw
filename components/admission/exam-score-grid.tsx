"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ScanLine, Search, Upload } from "lucide-react";

import { ScanResultsImport } from "@/components/admission/scan-import";
import { saveExamScores, savePassingScore } from "@/features/admission/actions/exam-scores";
import type { ExamSubject, PassingRule } from "@/features/admission/exam";
import { ATTENDANCE, formatPassingRule, isPassing } from "@/features/admission/exam-scoring";
import { tableStyles } from "@/components/ui/table-styles";
import { toast } from "@/components/ui/toaster";

export type ScoreRow = {
  application_id: number;
  application_no: string;
  name: string;
  /** Saved per-subject scores, else from an imported answer sheet (null = none). */
  scores: Record<number, number | null>;
  /** Saved total and pass/fail from tbl_exam_result (null = no result yet). */
  savedTotal: number | null;
  savedPassed: boolean | null;
  /** Attendance at their exam session (Exam Schedule); null = not marked / not seated. */
  attendance: "PRESENT" | "ABSENT" | null;
};

/** Scores can only be entered for applicants marked present at their exam session. */
const canScore = (row: ScoreRow) => row.attendance === ATTENDANCE.PRESENT;

type Feedback = { type: "success" | "error"; text: string; details?: string[] } | null;
type Draft = Record<number, Record<number, string>>;

const fieldClass =
  "h-8 rounded-sm border border-neutral-500 bg-white px-2 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const cell = "border border-neutral-200 px-2 py-1 text-center";

const toText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function PassingChip({
  cycleId,
  rule,
  canWrite,
}: Readonly<{ cycleId: number; rule: PassingRule | null; canWrite: boolean }>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rule ? String(rule.value) : "");
  const [byPoints, setByPoints] = useState(rule?.byPoints ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chip = (
    <span className="inline-flex h-7 items-center rounded-sm bg-[#c5c8f0] px-2.5 text-sm text-black">
      Passing score: <span className="ml-1 font-semibold tabular-nums">{formatPassingRule(rule)}</span>
    </span>
  );

  if (!canWrite) return chip;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-sm hover:ring-2 hover:ring-[#191e73]/30"
        title="Change the passing score"
      >
        {chip}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await savePassingScore(cycleId, { value: Number(value), byPoints });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <label className="text-sm">
        <span className="sr-only">Passing score</span>
        <input
          type="number"
          min={0}
          step="any"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${fieldClass} w-20`}
        />
      </label>
      <label className="text-sm">
        <span className="sr-only">Unit</span>
        <select value={byPoints ? "points" : "percent"} onChange={(e) => setByPoints(e.target.value === "points")} className={fieldClass}>
          <option value="percent">percent</option>
          <option value="points">points</option>
        </select>
      </label>
      <button type="submit" disabled={isPending} className="h-8 rounded-md bg-[#191e73] px-3 text-sm font-semibold text-white disabled:opacity-60">
        {isPending ? "Saving…" : "Set"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-md border border-neutral-500 bg-white px-3 text-sm">
        Cancel
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
      <span className="w-full text-xs text-neutral-600">Saved results are re-checked against the new passing score.</span>
    </form>
  );
}

/** Normalizes a CSV header: lowercase, no "/25" suffix, no spaces or punctuation. */
const normalize = (header: string) => header.toLowerCase().replace(/\/\s*\d+\s*$/, "").replace(/[^a-z0-9]/g, "");

export function ExamScoreGrid({
  cycleId,
  subjects,
  rule,
  rows,
  canWrite,
  yearFilter,
}: Readonly<{
  cycleId: number;
  subjects: ExamSubject[];
  rule: PassingRule | null;
  rows: ScoreRow[];
  canWrite: boolean;
  /** School year dropdown, placed in the filter row before search. */
  yearFilter?: ReactNode;
}>) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "missing" | "scored">("all");
  const [scanOpen, setScanOpen] = useState(false);

  const maxTotal = subjects.reduce((sum, s) => sum + s.max, 0);

  const valueOf = (row: ScoreRow, competencyId: number) =>
    draft[row.application_id]?.[competencyId] ?? toText(row.scores[competencyId]);

  const isDirty = (row: ScoreRow) =>
    subjects.some((s) => valueOf(row, s.competency_id).trim() !== toText(row.scores[s.competency_id]));

  const invalid = (text: string, max: number) => text.trim() !== "" && !(/^\d+$/.test(text.trim()) && Number(text) <= max);

  function evaluate(row: ScoreRow) {
    const texts = subjects.map((s) => valueOf(row, s.competency_id).trim());
    const hasInvalid = subjects.some((s, i) => invalid(texts[i], s.max));
    const filled = texts.filter((t) => t !== "").length;
    const total = hasInvalid ? null : texts.reduce((sum, t) => sum + (t === "" ? 0 : Number(t)), 0);
    const complete = filled === subjects.length && !hasInvalid;
    return { total, filled, complete, hasInvalid, passed: complete && rule ? isPassing(total!, maxTotal, rule) : null };
  }

  const dirtyRows = rows.filter((row) => canScore(row) && isDirty(row));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.application_no.toLowerCase().includes(q)) return false;
      const saved = row.savedTotal !== null;
      if (show === "missing") return !saved;
      if (show === "scored") return saved;
      return true;
    });
  }, [rows, query, show]);

  function setValue(applicationId: number, competencyId: number, value: string) {
    setDraft((prev) => ({ ...prev, [applicationId]: { ...prev[applicationId], [competencyId]: value } }));
  }

  function importCsv(file: File) {
    setFeedback(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (parsed) => {
        const headers = parsed.meta.fields ?? [];
        const idHeader = headers.find((h) =>
          ["applicantid", "applicationno", "applicationnumber", "applicationid"].includes(normalize(h)),
        );
        if (!idHeader) {
          setFeedback({ type: "error", text: 'The CSV needs an "Applicant ID" column (the application number).' });
          return;
        }

        const columns = subjects.map((subject) => ({
          subject,
          header: headers.find((h) => [normalize(subject.short), normalize(subject.name)].includes(normalize(h))),
        }));
        const missing = columns.filter((c) => !c.header).map((c) => c.subject.short);
        if (missing.length === columns.length) {
          setFeedback({ type: "error", text: `No subject columns found. Expected: ${subjects.map((s) => s.short).join(", ")}.` });
          return;
        }

        const byNo = new Map(rows.map((r) => [r.application_no.trim().toLowerCase(), r]));
        const problems: string[] = [];
        const next: Draft = {};
        let matched = 0;

        parsed.data.forEach((record, index) => {
          const no = (record[idHeader] ?? "").trim();
          const row = byNo.get(no.toLowerCase());
          if (!row) {
            problems.push(`Line ${index + 2}: applicant "${no || "(blank)"}" is not on this list.`);
            return;
          }
          if (!canScore(row)) {
            problems.push(`Line ${index + 2} (${no}): skipped, not marked present on the Exam Schedule.`);
            return;
          }
          matched++;
          next[row.application_id] = {};
          for (const { subject, header } of columns) {
            if (!header) continue;
            const text = (record[header] ?? "").trim();
            if (invalid(text, subject.max)) {
              problems.push(`Line ${index + 2} (${no}): ${subject.short} "${text}" is not a whole number from 0 to ${subject.max}.`);
            }
            next[row.application_id][subject.competency_id] = text;
          }
        });

        setDraft((prev) => {
          const merged = { ...prev };
          for (const [id, values] of Object.entries(next)) merged[Number(id)] = { ...prev[Number(id)], ...values };
          return merged;
        });
        setFeedback({
          type: problems.length ? "error" : "success",
          text:
            `Imported scores for ${matched} applicant${matched === 1 ? "" : "s"}. Review them, then click Save results.` +
            (missing.length ? ` Missing columns: ${missing.join(", ")}.` : ""),
          details: problems.slice(0, 20).concat(problems.length > 20 ? [`…and ${problems.length - 20} more.`] : []),
        });
      },
      error: (error) => setFeedback({ type: "error", text: `Could not read the CSV: ${error.message}` }),
    });
  }

  function save() {
    setFeedback(null);
    const incomplete = dirtyRows.filter((row) => !evaluate(row).complete);
    if (incomplete.length > 0) {
      setFeedback({
        type: "error",
        text: `Fill in every subject with a valid score for ${incomplete.length} changed applicant${incomplete.length === 1 ? "" : "s"} before saving.`,
        details: incomplete.slice(0, 10).map((r) => `${r.application_no} – ${r.name}`),
      });
      return;
    }

    startTransition(async () => {
      const result = await saveExamScores(
        cycleId,
        dirtyRows.map((row) => ({
          application_id: row.application_id,
          scores: subjects.map((s) => ({ competency_id: s.competency_id, score: Number(valueOf(row, s.competency_id)) })),
        })),
      );
      if ("error" in result) {
        setFeedback({ type: "error", text: result.error });
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setDraft({});
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PassingChip key={formatPassingRule(rule)} cycleId={cycleId} rule={rule} canWrite={canWrite} />
        <span className="text-xs text-neutral-600 italic">
          Total out of {maxTotal}; status updates as scores are typed.
        </span>
        {canWrite && (
          <div className="ml-auto flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importCsv(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              disabled={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60"
              title="Upload raw A–D answers and auto-grade them against the answer key"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Import scanned results
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60"
              title={`CSV columns: Applicant ID, ${subjects.map((s) => s.short).join(", ")}`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import Scores
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending || dirtyRows.length === 0}
              className="h-8 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
            >
              {isPending ? "Saving…" : `Save results${dirtyRows.length ? ` (${dirtyRows.length})` : ""}`}
            </button>
          </div>
        )}
      </div>

      {canWrite && <ScanResultsImport cycleId={cycleId} open={scanOpen} onClose={() => setScanOpen(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        {yearFilter}
        <label className="relative">
          <span className="sr-only">Search applicants</span>
          <Search className="pointer-events-none absolute top-2 left-2 h-4 w-4 text-neutral-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or ID"
            className={`${fieldClass} w-56 pl-7`}
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={fieldClass}>
            <option value="all">All applicants ({rows.length})</option>
            <option value="missing">Without saved scores</option>
            <option value="scored">With saved scores</option>
          </select>
        </label>
      </div>

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-sm border p-2 text-sm ${
            feedback.type === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.text}
          {feedback.details && feedback.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {feedback.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={`${tableStyles.wrap} max-h-[65vh] overflow-y-auto`}>
        <table className={tableStyles.grid}>
          <thead className="sticky top-0 z-10">
            <tr className={tableStyles.gridHeadRow}>
              <th className={`${cell} font-medium`}>Applicant ID</th>
              <th className={`${cell} text-left font-medium`}>Name</th>
              {subjects.map((s) => (
                <th key={s.competency_id} className={`${cell} font-medium whitespace-nowrap`} title={s.name}>
                  {s.short}/{s.max}
                </th>
              ))}
              <th className={`${cell} font-medium whitespace-nowrap`}>Total/{maxTotal}</th>
              <th className={`${cell} font-medium`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={subjects.length + 4} className={`${cell} py-8 text-neutral-600`}>
                  {rows.length === 0 ? "No applicants are taking the exam this school year." : "No applicants match."}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const result = evaluate(row);
              const dirty = isDirty(row);
              // Untouched rows show the saved result; typed rows show the live calculation.
              const showSaved = !dirty && row.savedTotal !== null;
              const total = showSaved ? row.savedTotal : result.filled === 0 ? null : result.total;
              const passed = showSaved ? row.savedPassed : result.passed;
              return (
                <tr key={row.application_id} className={dirty ? "bg-amber-50" : "hover:bg-[#f4f5fd]"}>
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{row.application_no}</td>
                  <td className={`${cell} text-left`}>
                    {row.name}
                    {row.attendance === ATTENDANCE.ABSENT && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-[11px] text-red-900" title="Marked absent at their exam session; scores can't be entered">
                        Absent
                      </span>
                    )}
                    {row.attendance === null && (
                      <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 text-[11px] text-neutral-700" title="Mark them present on the Exam Schedule before entering scores">
                        Attendance not marked
                      </span>
                    )}
                  </td>
                  {subjects.map((s) => {
                    const text = valueOf(row, s.competency_id);
                    const bad = invalid(text, s.max);
                    return (
                      <td key={s.competency_id} className={`${cell} p-0.5`}>
                        {canWrite && canScore(row) ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={text}
                            onChange={(e) => setValue(row.application_id, s.competency_id, e.target.value)}
                            aria-label={`${s.short} score for ${row.name}`}
                            aria-invalid={bad}
                            title={bad ? `Enter a whole number from 0 to ${s.max}` : undefined}
                            className={`h-7 w-14 rounded-sm border text-center tabular-nums outline-none focus:ring-2 focus:ring-[#191e73]/30 ${
                              bad ? "border-red-500 bg-red-50" : "border-transparent hover:border-neutral-400"
                            }`}
                          />
                        ) : (
                          <span className="tabular-nums">{text || "--"}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${cell} font-medium tabular-nums`}>{total ?? "--"}</td>
                  <td className={cell}>
                    {passed === true && <span className="rounded-full bg-green-100 px-2 text-xs text-green-900">Passed</span>}
                    {passed === false && <span className="rounded-full bg-red-100 px-2 text-xs text-red-900">Failed</span>}
                    {passed === null && (
                      <span className="text-xs text-neutral-600">
                        {result.hasInvalid ? "Invalid" : result.filled === 0 ? "--" : result.complete ? "No passing score" : "Incomplete"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-600 italic">
        Scores can only be entered for applicants marked present on the Exam Schedule. Total and status update
        automatically as scores are typed. Changed rows are highlighted until saved. Saved
        subject scores also update the applicant&apos;s course recommendations.
      </p>
    </div>
  );
}
