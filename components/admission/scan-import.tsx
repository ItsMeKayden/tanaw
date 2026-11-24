"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileUp, ScanLine, X } from "lucide-react";

import { previewScannedResults, saveExamScores } from "@/features/admission/actions/exam-scores";
import type { ScannedPreviewRow } from "@/features/admission/exam-grading";
import { toast } from "@/components/ui/toaster";

const primaryButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60";
const outlineButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60";

type Feedback = { type: "success" | "error"; text: string } | null;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function downloadTemplate() {
  const csv = "application_no,answers\nAPP-0001,ABCDABCDAB\nAPP-0002,BADCBADCBA\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scanned-results-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ScanResultsImport({ cycleId, onClose }: Readonly<{ cycleId: number; onClose: () => void }>) {
  const router = useRouter();
  const [isParsing, startParse] = useTransition();
  const [isImporting, startImport] = useTransition();
  const [rows, setRows] = useState<ScannedPreviewRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const errorCount = rows?.filter((r) => r.error).length ?? 0;
  const warnCount = rows?.filter((r) => r.warning).length ?? 0;
  const importable = rows?.filter((r) => !r.error && r.application_id !== null) ?? [];

  function reset() {
    setRows(null);
    setFileName("");
    setFeedback(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFeedback(null);
    setRows(null);
    setFileName(file.name);
    startParse(async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await previewScannedResults(cycleId, file.name, base64);
        if ("error" in result) setFeedback({ type: "error", text: result.error });
        else setRows(result.rows);
      } catch {
        setFeedback({ type: "error", text: "Could not read the file." });
      }
    });
  }

  function confirmImport() {
    if (importable.length === 0) return;
    setFeedback(null);
    const payload = importable.map((r) => ({ application_id: r.application_id as number, scores: r.scores }));
    startImport(async () => {
      const result = await saveExamScores(cycleId, payload);
      toast.fromResult(result);
      if ("error" in result) setFeedback({ type: "error", text: result.error });
      else {
        reset();
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-neutral-400 bg-white/95 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanLine className="h-4 w-4 text-[#191e73]" aria-hidden="true" />
          Import scanned results
        </h2>
        <button
          type="button"
          onClick={() => { reset(); onClose(); }}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-neutral-700">
        Upload a <strong>.csv</strong> with a header row: an{" "}
        <code className="rounded bg-neutral-200 px-1">application_no</code> column plus either an{" "}
        <code className="rounded bg-neutral-200 px-1">answers</code> column (e.g.{" "}
        <code className="rounded bg-neutral-200 px-1">ABCDA</code>) or one column per question (q1, q2, …). Scores
        are graded against this exam&apos;s answer key, then saved like typed scores.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className={`${outlineButton} cursor-pointer`}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Choose CSV
          <input type="file" accept=".csv" onChange={onFile} className="hidden" />
        </label>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-1 text-xs text-[#191e73] hover:underline"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> Download CSV template
        </button>
        {fileName && <span className="text-xs text-neutral-500">{fileName}</span>}
        {isParsing && <span className="text-xs text-neutral-500">Reading…</span>}
      </div>

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-[#191e73]">{rows.length} rows</span>
            <span className="text-green-700">{importable.length} ready</span>
            {errorCount > 0 && <span className="text-red-700">{errorCount} skipped (errors)</span>}
            {warnCount > 0 && <span className="text-amber-700">{warnCount} warning{warnCount === 1 ? "" : "s"}</span>}
          </div>
          <div className="max-h-72 overflow-auto rounded-md border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-100">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Row</th>
                  <th className="px-2 py-1 text-left font-medium">App No.</th>
                  <th className="px-2 py-1 text-left font-medium">Name</th>
                  <th className="px-2 py-1 text-right font-medium">Answered</th>
                  <th className="px-2 py-1 text-right font-medium">Score</th>
                  <th className="px-2 py-1 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.rowNumber}
                    className={r.error ? "bg-red-50" : r.warning ? "bg-amber-50" : "odd:bg-white even:bg-neutral-50"}
                  >
                    <td className="px-2 py-1 tabular-nums text-neutral-500">{r.rowNumber}</td>
                    <td className="px-2 py-1">{r.application_no || "—"}</td>
                    <td className="px-2 py-1">{r.applicant_name ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.answered}/{r.questionCount}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.total}/{r.max}
                      {r.percentage !== null && <span className="text-neutral-400"> ({r.percentage}%)</span>}
                    </td>
                    <td className="px-2 py-1">
                      {r.error ? (
                        <span className="text-red-700">{r.error}</span>
                      ) : r.warning ? (
                        <span className="text-amber-700">{r.warning}</span>
                      ) : (
                        <span className="text-green-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importable.length === 0 || isImporting}
              onClick={confirmImport}
              className={primaryButton}
            >
              {isImporting ? "Saving…" : `Save ${importable.length} result${importable.length === 1 ? "" : "s"}`}
            </button>
            {errorCount > 0 && (
              <span className="text-xs text-neutral-500">
                {errorCount} row{errorCount === 1 ? "" : "s"} with errors will be skipped.
              </span>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-sm border p-2 text-xs ${
            feedback.type === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
