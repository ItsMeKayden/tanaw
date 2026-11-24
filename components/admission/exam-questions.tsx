"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileDown,
  FileUp,
  Lock,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { tableStyles } from "@/components/ui/table-styles";
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  bulkCreateQuestions,
  bulkCreateQuestionsFromRows,
  previewAnswerKeyFile,
  createExam,
  updateExam,
} from "@/features/admission/actions/exam-questions";
import {
  examQuestionSchema,
  examSchema,
  type BulkQuestionRow,
  type ExamQuestionValues,
  type ExamValues,
  type ParsedAnswerRow,
} from "@/features/admission/schemas";
import { toast } from "@/components/ui/toaster";

// ─── Public types (consumed by page.tsx) ────────────────────────────────────

export type QuestionRow = {
  question_id: number;
  question_no: number;
  correct_answer: string;
  points: number;
  competency_id: number | null;
  competency_name: string | null;
};

export type CompetencyOption = {
  competency_id: number;
  competency_name: string;
};

export type ExamInfo = {
  exam_name: string;
  exam_date: string | null;
  declared_max: number | null;
  declared_items: number | null;
};

export type ResponseStat = {
  question_id: number;
  correct: number;
  wrong: number;
};

export type ExamSessionOption = {
  session_id: number;
  label: string;
  assigned: number;
};

// ─── Internal types ──────────────────────────────────────────────────────────

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { error: string } | { success: true; message: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const fieldClass =
  "h-9 w-full rounded-md border border-neutral-400 bg-white px-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const primaryButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60";
const outlineButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60";

const EMPTY: ExamQuestionValues = { question_no: "", correct_answer: "", points: "1", competency_id: "" };
const EMPTY_EXAM: ExamValues = { exam_name: "", exam_date: "", total_items: "", max_score: "" };

// ─── Small helpers ────────────────────────────────────────────────────────────

function FeedbackLine({ feedback }: Readonly<{ feedback: Feedback }>) {
  if (!feedback) return null;
  return (
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
  );
}

// ─── Exam info card ───────────────────────────────────────────────────────────

function ExamInfoCard({
  examInfo,
  computedTotal,
  questionCount,
  onEdit,
}: Readonly<{ examInfo: ExamInfo; computedTotal: number; questionCount: number; onEdit?: () => void }>) {
  const { exam_name, exam_date, declared_max, declared_items } = examInfo;

  const maxMismatch = declared_max !== null && declared_max !== computedTotal && computedTotal > 0;
  const itemsMismatch = declared_items !== null && declared_items !== questionCount && questionCount > 0;

  return (
    <div className="rounded-md border border-neutral-300 bg-white/95 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex items-start gap-2">
          <div>
            <p className="text-xs text-neutral-500">Exam</p>
            <p className="font-semibold text-neutral-900">{exam_name}</p>
            <p className="text-xs text-neutral-600">{exam_date ?? "No exam date set"}</p>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-neutral-500 hover:bg-[#eef0fd] hover:text-[#191e73]"
              aria-label="Edit exam"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="text-center">
            <p className="text-xs text-neutral-500">Questions</p>
            <p className={`font-semibold tabular-nums ${itemsMismatch ? "text-amber-700" : "text-neutral-900"}`}>
              {questionCount}
              {declared_items !== null && declared_items !== questionCount && (
                <span className="ml-1 text-xs font-normal text-neutral-500">/ {declared_items} declared</span>
              )}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-neutral-500">Total points</p>
            <p className={`font-semibold tabular-nums ${maxMismatch ? "text-amber-700" : "text-neutral-900"}`}>
              {computedTotal}
              {declared_max !== null && declared_max !== computedTotal && computedTotal > 0 && (
                <span className="ml-1 text-xs font-normal text-neutral-500">/ {declared_max} declared</span>
              )}
            </p>
          </div>
        </div>
      </div>
      {(maxMismatch || itemsMismatch) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          The declared exam settings don&apos;t match the current question set. Consider updating the exam or adjusting the questions.
        </p>
      )}
    </div>
  );
}

// ─── Exam form (create / edit) ────────────────────────────────────────────────

function ExamForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: Readonly<{
  defaultValues: ExamValues;
  submitLabel: string;
  onSubmit: (values: ExamValues) => Promise<ActionResult>;
  onCancel?: () => void;
}>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExamValues>({ resolver: zodResolver(examSchema), defaultValues, mode: "onTouched" });

  const submit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if ("error" in result) setError(result.error);
    });
  });

  const border = (name: keyof ExamValues) => (errors[name] ? "border-red-500" : "");

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-neutral-700">Exam name</label>
          <input
            type="text"
            maxLength={150}
            placeholder="e.g. Admission Exam 2026-2027"
            {...register("exam_name")}
            aria-invalid={Boolean(errors.exam_name)}
            className={`${fieldClass} ${border("exam_name")}`}
          />
          {errors.exam_name && <span className="text-xs text-red-600">{errors.exam_name.message}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Exam date</label>
          <input
            type="date"
            {...register("exam_date")}
            aria-invalid={Boolean(errors.exam_date)}
            className={`${fieldClass} ${border("exam_date")}`}
          />
          {errors.exam_date ? (
            <span className="text-xs text-red-600">{errors.exam_date.message}</span>
          ) : (
            <span className="text-xs text-neutral-500">
              After this date the set locks and becomes read-only.
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-700">Items (optional)</label>
            <input
              type="number"
              min={1}
              {...register("total_items")}
              aria-invalid={Boolean(errors.total_items)}
              className={`${fieldClass} ${border("total_items")}`}
            />
            {errors.total_items && <span className="text-xs text-red-600">{errors.total_items.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-700">Max score (optional)</label>
            <input
              type="number"
              min={1}
              {...register("max_score")}
              aria-invalid={Boolean(errors.max_score)}
              className={`${fieldClass} ${border("max_score")}`}
            />
            {errors.max_score && <span className="text-xs text-red-600">{errors.max_score.message}</span>}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={isPending} className={primaryButton}>
          {isPending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={outlineButton}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ─── Locked banner ────────────────────────────────────────────────────────────

function LockedBanner() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
      <span>
        <strong>This exam is locked.</strong>{" "}
        The exam date has passed, so questions can no longer be added, edited, or deleted. This keeps the answer
        key stable for applicants who have already taken it.
      </span>
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({
  questions,
  competencies,
}: Readonly<{ questions: QuestionRow[]; competencies: CompetencyOption[] }>) {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const bySubject = competencies
    .map((c) => {
      const pts = questions.filter((q) => q.competency_id === c.competency_id).reduce((s, q) => s + q.points, 0);
      return pts > 0 ? { name: c.competency_name, pts } : null;
    })
    .filter((x): x is { name: string; pts: number } => x !== null);
  const unassigned = questions.filter((q) => q.competency_id === null).reduce((s, q) => s + q.points, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[#eef0fd] px-3 py-2 text-xs text-neutral-700">
      <span className="font-semibold text-[#191e73]">
        {questions.length} question{questions.length === 1 ? "" : "s"}
      </span>
      <span className="text-neutral-400">·</span>
      <span>
        <span className="font-semibold tabular-nums">{totalPoints}</span> total pt{totalPoints === 1 ? "" : "s"}
      </span>
      {bySubject.map(({ name, pts }) => (
        <span key={name} className="text-neutral-600">
          {name}: <span className="font-semibold tabular-nums">{pts}</span>
        </span>
      ))}
      {unassigned > 0 && bySubject.length > 0 && (
        <span className="text-neutral-500">
          Unassigned: <span className="tabular-nums">{unassigned}</span>
        </span>
      )}
    </div>
  );
}

// ─── Question form (add / edit) ───────────────────────────────────────────────

function QuestionForm({
  competencies,
  defaultValues,
  nextQuestionNo,
  onSubmit,
  onCancel,
  submitLabel,
}: Readonly<{
  competencies: CompetencyOption[];
  defaultValues: ExamQuestionValues;
  nextQuestionNo: number;
  onSubmit: (values: ExamQuestionValues) => Promise<ActionResult>;
  onCancel: () => void;
  submitLabel: string;
}>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExamQuestionValues>({
    resolver: zodResolver(examQuestionSchema),
    defaultValues,
    mode: "onTouched",
  });

  const submit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if ("error" in result) setError(result.error);
    });
  });

  const border = (name: keyof ExamQuestionValues) => (errors[name] ? "border-red-500" : "");

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[80px_1fr_80px_1fr_auto]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Q#</label>
          <input
            type="number"
            min={1}
            max={10000}
            placeholder={String(nextQuestionNo)}
            {...register("question_no")}
            aria-invalid={Boolean(errors.question_no)}
            className={`${fieldClass} ${border("question_no")}`}
          />
          {errors.question_no && <span className="text-xs text-red-600">{errors.question_no.message}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Correct answer</label>
          <input
            type="text"
            maxLength={255}
            placeholder="e.g. A"
            {...register("correct_answer")}
            aria-invalid={Boolean(errors.correct_answer)}
            className={`${fieldClass} ${border("correct_answer")}`}
          />
          {errors.correct_answer && <span className="text-xs text-red-600">{errors.correct_answer.message}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Points</label>
          <input
            type="number"
            min={1}
            max={1000}
            {...register("points")}
            aria-invalid={Boolean(errors.points)}
            className={`${fieldClass} ${border("points")}`}
          />
          {errors.points && <span className="text-xs text-red-600">{errors.points.message}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-700">Subject (optional)</label>
          <select {...register("competency_id")} className={`${fieldClass} ${border("competency_id")}`}>
            <option value="">— None —</option>
            {competencies.map((c) => (
              <option key={c.competency_id} value={String(c.competency_id)}>
                {c.competency_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? "Saving…" : submitLabel}
          </button>
          <button type="button" onClick={onCancel} className={outlineButton}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-700 sm:col-span-5">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

// ─── Bulk import panel ────────────────────────────────────────────────────────

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
  const csv =
    "question_no,correct_answer,points,competency\n1,A,1,Mathematics\n2,C,1,Science\n3,B,2,English\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "answer-key-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function TabButton({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium ${
        active ? "border-[#191e73] text-[#191e73]" : "border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function PasteImport({ cycleId, onDone }: Readonly<{ cycleId: number; onDone: () => void }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const submit = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await bulkCreateQuestions(cycleId, text);
      toast.fromResult(result);
      if ("error" in result) {
        setFeedback({ type: "error", text: result.error });
      } else {
        setText("");
        router.refresh();
        onDone();
      }
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-700">
        Paste answers separated by spaces, commas, or new lines (e.g.{" "}
        <code className="rounded bg-neutral-200 px-1">A B C D A</code>). Each token becomes the next
        question&apos;s answer, appended after the last existing question. Default: 1 point, no subject.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"A\nB\nC\nD\nA"}
        className="w-full resize-y rounded-md border border-neutral-400 bg-white p-2 font-mono text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={isPending || tokens.length === 0} onClick={submit} className={primaryButton}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {isPending
            ? "Importing…"
            : `Import ${tokens.length > 0 ? tokens.length : ""} question${tokens.length === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-neutral-500 tabular-nums">
          {tokens.length} answer{tokens.length === 1 ? "" : "s"} detected
        </span>
      </div>
      <FeedbackLine feedback={feedback} />
    </div>
  );
}

function FileImport({ cycleId, onDone }: Readonly<{ cycleId: number; onDone: () => void }>) {
  const router = useRouter();
  const [isParsing, startParse] = useTransition();
  const [isImporting, startImport] = useTransition();
  const [rows, setRows] = useState<ParsedAnswerRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const errorCount = rows?.filter((r) => r.error).length ?? 0;
  const warnCount = rows?.filter((r) => r.warning).length ?? 0;
  const importable = rows !== null && rows.length > 0 && errorCount === 0;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name
    if (!file) return;
    setFeedback(null);
    setRows(null);
    setFileName(file.name);
    startParse(async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await previewAnswerKeyFile(file.name, base64);
        if ("error" in result) setFeedback({ type: "error", text: result.error });
        else setRows(result.rows);
      } catch {
        setFeedback({ type: "error", text: "Could not read the file." });
      }
    });
  }

  function confirmImport() {
    if (!rows) return;
    setFeedback(null);
    const payload: BulkQuestionRow[] = rows.map((r) => ({
      question_no: r.question_no,
      correct_answer: r.correct_answer,
      points: r.points,
      competency_id: r.competency_id,
    }));
    startImport(async () => {
      const result = await bulkCreateQuestionsFromRows(cycleId, payload);
      toast.fromResult(result);
      if ("error" in result) setFeedback({ type: "error", text: result.error });
      else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-700">
        Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file with a header row. Recognized columns:{" "}
        <code className="rounded bg-neutral-200 px-1">correct_answer</code> (required),{" "}
        <code className="rounded bg-neutral-200 px-1">question_no</code>,{" "}
        <code className="rounded bg-neutral-200 px-1">points</code>,{" "}
        <code className="rounded bg-neutral-200 px-1">competency</code> (optional). Leave{" "}
        <code className="rounded bg-neutral-200 px-1">question_no</code> blank to append after existing questions.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${outlineButton} cursor-pointer`}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Choose file
          <input type="file" accept=".csv,.xlsx" onChange={onFile} className="hidden" />
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
            {errorCount > 0 && <span className="text-red-700">{errorCount} with errors</span>}
            {warnCount > 0 && <span className="text-amber-700">{warnCount} warning{warnCount === 1 ? "" : "s"}</span>}
            {errorCount === 0 && <span className="text-green-700">Ready to import</span>}
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-100">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Row</th>
                  <th className="px-2 py-1 text-left font-medium">Q#</th>
                  <th className="px-2 py-1 text-left font-medium">Answer</th>
                  <th className="px-2 py-1 text-right font-medium">Pts</th>
                  <th className="px-2 py-1 text-left font-medium">Subject</th>
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
                    <td className="px-2 py-1 tabular-nums">{r.question_no ?? "auto"}</td>
                    <td className="px-2 py-1 font-mono">{r.correct_answer || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.points}</td>
                    <td className="px-2 py-1">{r.competency_label || "—"}</td>
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
            <button type="button" disabled={!importable || isImporting} onClick={confirmImport} className={primaryButton}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isImporting ? "Importing…" : `Import ${rows.length} question${rows.length === 1 ? "" : "s"}`}
            </button>
            {errorCount > 0 && (
              <span className="text-xs text-red-700">
                Fix the {errorCount} flagged row{errorCount === 1 ? "" : "s"} and re-upload.
              </span>
            )}
          </div>
        </div>
      )}
      <FeedbackLine feedback={feedback} />
    </div>
  );
}

function BulkImportPanel({ cycleId, onDone }: Readonly<{ cycleId: number; onDone: () => void }>) {
  const [tab, setTab] = useState<"paste" | "file">("paste");
  return (
    <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3">
      <div className="mb-3 flex items-center gap-1 border-b border-neutral-200">
        <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
          Paste answers
        </TabButton>
        <TabButton active={tab === "file"} onClick={() => setTab("file")}>
          Upload CSV / Excel
        </TabButton>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto rounded p-1 text-neutral-500 hover:bg-neutral-200"
          aria-label="Close bulk import"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {tab === "paste" ? <PasteImport cycleId={cycleId} onDone={onDone} /> : <FileImport cycleId={cycleId} onDone={onDone} />}
    </div>
  );
}

// ─── Pagination controls ──────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: Readonly<{ page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }>) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 pt-1 text-xs text-neutral-600">
      <span className="tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className="rounded p-1 hover:bg-neutral-100 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded p-1 hover:bg-neutral-100 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Printable answer key / preview ───────────────────────────────────────────

function PrintPreview({
  examInfo,
  schoolYear,
  questions,
  competencies,
  onClose,
}: Readonly<{
  examInfo: ExamInfo | null;
  schoolYear: string;
  questions: QuestionRow[];
  competencies: CompetencyOption[];
  onClose: () => void;
}>) {
  const sorted = [...questions].sort((a, b) => a.question_no - b.question_no);
  const totalPoints = sorted.reduce((s, q) => s + q.points, 0);
  const hasSubjects = sorted.some((q) => q.competency_id !== null);

  return (
    <div className="answer-key-print fixed inset-0 z-50 overflow-auto bg-white">
      <style>{`@media print {
        body { visibility: hidden !important; }
        .answer-key-print, .answer-key-print * { visibility: visible !important; }
        .answer-key-print { position: absolute; inset: 0; overflow: visible; }
        .no-print { display: none !important; }
        .ak-cell { break-inside: avoid; }
      }`}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-300 bg-neutral-50 px-4 py-2">
        <span className="text-sm font-medium text-neutral-700">Answer key preview</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className={primaryButton}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print
          </button>
          <button type="button" onClick={onClose} className={outlineButton}>
            <X className="h-4 w-4" aria-hidden="true" /> Close
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-8 py-6 text-neutral-900">
        <header className="mb-4 text-center">
          <h1 className="text-lg font-bold">{examInfo?.exam_name ?? "Answer Key"}</h1>
          <p className="text-sm text-neutral-600">
            S.Y. {schoolYear}
            {examInfo?.exam_date ? ` · ${examInfo.exam_date}` : ""}
          </p>
          <p className="text-xs text-neutral-500">
            {sorted.length} item{sorted.length === 1 ? "" : "s"} · {totalPoints} point
            {totalPoints === 1 ? "" : "s"}
          </p>
        </header>

        {sorted.length === 0 ? (
          <p className="text-center text-sm text-neutral-500">No questions to show.</p>
        ) : (
          <div className="grid grid-cols-5 gap-x-6 gap-y-1 text-sm">
            {sorted.map((q) => (
              <div
                key={q.question_id}
                className="ak-cell flex items-baseline gap-1 border-b border-dotted border-neutral-300 py-0.5"
              >
                <span className="w-7 shrink-0 text-right font-medium tabular-nums text-neutral-500">
                  {q.question_no}.
                </span>
                <span className="font-mono font-semibold">{q.correct_answer}</span>
                {q.points !== 1 && <span className="ml-auto text-[10px] text-neutral-400">{q.points}pt</span>}
              </div>
            ))}
          </div>
        )}

        {hasSubjects && (
          <div className="mt-6 border-t border-neutral-300 pt-3 text-xs text-neutral-600">
            <p className="font-medium">Points by subject</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {competencies.map((c) => {
                const pts = sorted
                  .filter((q) => q.competency_id === c.competency_id)
                  .reduce((s, q) => s + q.points, 0);
                return pts > 0 ? (
                  <span key={c.competency_id}>
                    {c.competency_name}: <span className="font-semibold tabular-nums">{pts}</span>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Answer-sheet print menu ──────────────────────────────────────────────────

function AnswerSheetButton({
  cycleId,
  sessions,
}: Readonly<{ cycleId: number; sessions: ExamSessionOption[] }>) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = sessions.length > 0 && selected.size === sessions.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.session_id)));
  }

  function print() {
    if (selected.size === 0) return;
    const url = `/api/admission/answer-sheets?cycle=${cycleId}&sessions=${[...selected].join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={outlineButton}>
        <FileDown className="h-4 w-4" aria-hidden="true" />
        Answer sheets
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-neutral-300 bg-white p-2 shadow-lg">
            {sessions.length === 0 ? (
              <p className="p-2 text-xs text-neutral-500">
                No upcoming exam sessions. Assign applicants to a session on the Exam Schedule page first.
              </p>
            ) : (
              <>
                <p className="px-1 pb-1 text-xs font-semibold text-neutral-700">Print sheets for session(s)</p>
                <label className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-neutral-50">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#191e73]" />
                  <span className="font-medium">All upcoming sessions</span>
                </label>
                <div className="my-1 max-h-56 divide-y divide-neutral-100 overflow-auto border-y border-neutral-100">
                  {sessions.map((s) => (
                    <label
                      key={s.session_id}
                      className="flex items-center gap-2 px-1 py-1.5 text-xs hover:bg-neutral-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.session_id)}
                        onChange={() => toggle(s.session_id)}
                        className="accent-[#191e73]"
                      />
                      <span className="flex-1">{s.label}</span>
                      <span className="whitespace-nowrap text-neutral-400 tabular-nums">{s.assigned} assigned</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={print}
                  className={`${primaryButton} mt-1 w-full`}
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Print{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Per-question result stats ────────────────────────────────────────────────

function ResponseCell({ stat }: Readonly<{ stat: ResponseStat | undefined }>) {
  if (!stat || stat.correct + stat.wrong === 0) {
    return <span className="text-xs text-neutral-400">Not taken yet</span>;
  }
  const total = stat.correct + stat.wrong;
  const pct = Math.round((stat.correct / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 min-w-[80px] max-w-[320px] flex-1 overflow-hidden rounded-full bg-red-200" title={`${pct}% correct`}>
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-28 shrink-0 whitespace-nowrap text-xs tabular-nums text-neutral-600">
        <span className="font-semibold text-green-700">{stat.correct}</span> ·{" "}
        <span className="font-semibold text-red-600">{stat.wrong}</span>
        <span className="text-neutral-400"> ({pct}%)</span>
      </span>
    </div>
  );
}

function DifficultyTag({ stat }: Readonly<{ stat: ResponseStat | undefined }>) {
  if (!stat || stat.correct + stat.wrong === 0) {
    return <span className="text-neutral-300">—</span>;
  }
  const pct = (stat.correct / (stat.correct + stat.wrong)) * 100;
  const [label, cls] =
    pct >= 80
      ? ["Easy", "bg-green-100 text-green-800"]
      : pct >= 50
      ? ["Moderate", "bg-amber-100 text-amber-800"]
      : ["Hard", "bg-red-100 text-red-800"];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExamQuestions({
  cycleId,
  schoolYear,
  questions,
  competencies,
  examId,
  examInfo,
  examDefaults,
  responseStats,
  examSessions,
  canWrite,
  isLocked,
  yearFilter,
}: Readonly<{
  cycleId: number;
  schoolYear: string;
  questions: QuestionRow[];
  competencies: CompetencyOption[];
  examId: number | null;
  examInfo: ExamInfo | null;
  examDefaults: ExamValues | null;
  responseStats: ResponseStat[];
  examSessions: ExamSessionOption[];
  canWrite: boolean;
  isLocked: boolean;
  yearFilter?: ReactNode;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [filterSubject, setFilterSubject] = useState("");
  const [filterAnswer, setFilterAnswer] = useState("");

  const computedTotal = questions.reduce((s, q) => s + q.points, 0);
  const nextQuestionNo = questions.length > 0 ? Math.max(...questions.map((q) => q.question_no)) + 1 : 1;

  const statMap = new Map(responseStats.map((s) => [s.question_id, s]));

  // Apply filters then sort.
  const filtered = questions.filter((q) => {
    if (filterSubject) {
      if (filterSubject === "__none__") {
        if (q.competency_id !== null) return false;
      } else if (String(q.competency_id) !== filterSubject) {
        return false;
      }
    }
    if (filterAnswer && !q.correct_answer.toLowerCase().includes(filterAnswer.toLowerCase())) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) =>
    sortAsc ? a.question_no - b.question_no : b.question_no - a.question_no,
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paged = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function run(action: () => Promise<ActionResult>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      toast.fromResult(result);
      setFeedback("error" in result ? { type: "error", text: result.error } : null);
      if (!("error" in result)) router.refresh();
    });
  }

  function handleDelete(q: QuestionRow) {
    if (!window.confirm(`Delete question #${q.question_no}?`)) return;
    run(() => deleteQuestion(q.question_id));
  }

  const colSpan = canWrite ? 7 : 6;

  // No exam exists for this school year yet.
  if (examId === null) {
    return (
      <div className="rounded-md border border-neutral-500 bg-white/95 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Exam questions</h2>
          {yearFilter}
        </div>
        {canWrite ? (
          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 space-y-3">
            <p className="text-sm text-neutral-700">
              No exam exists for <strong>S.Y. {schoolYear}</strong> yet. Create one to start adding
              questions.
            </p>
            <ExamForm
              defaultValues={{ ...EMPTY_EXAM, exam_name: `Admission Exam ${schoolYear}` }}
              submitLabel="Create exam"
              onSubmit={async (values) => {
                const result = await createExam(cycleId, values);
                toast.fromResult(result);
                if (!("error" in result)) router.refresh();
                return result;
              }}
            />
          </div>
        ) : (
          <p className="rounded-md border border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
            No exam exists for S.Y. {schoolYear} yet.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showPrint && (
        <PrintPreview
          examInfo={examInfo}
          schoolYear={schoolYear}
          questions={questions}
          competencies={competencies}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* Exam info card / edit form */}
      {examInfo &&
        (editingExam && examDefaults ? (
          <div className="rounded-md border border-neutral-300 bg-white/95 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-neutral-700">Edit exam</p>
            <ExamForm
              defaultValues={examDefaults}
              submitLabel="Save"
              onCancel={() => setEditingExam(false)}
              onSubmit={async (values) => {
                const result = await updateExam(examId, values);
                toast.fromResult(result);
                if (!("error" in result)) {
                  setEditingExam(false);
                  router.refresh();
                }
                return result;
              }}
            />
          </div>
        ) : (
          <ExamInfoCard
            examInfo={examInfo}
            computedTotal={computedTotal}
            questionCount={questions.length}
            onEdit={canWrite ? () => setEditingExam(true) : undefined}
          />
        ))}

      {/* Main card */}
      <div className="rounded-md border border-neutral-500 bg-white/95 p-3 space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Exam questions</h2>
            {yearFilter}
          </div>
          <div className="flex flex-wrap gap-2">
            {questions.length > 0 && (
              <button type="button" onClick={() => setShowPrint(true)} className={outlineButton}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Answer key
              </button>
            )}
            {questions.length > 0 && <AnswerSheetButton cycleId={cycleId} sessions={examSessions} />}
            {canWrite && !bulkOpen && !adding && (
              <button type="button" onClick={() => setBulkOpen(true)} className={outlineButton}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Bulk import
              </button>
            )}
            {canWrite && !adding && !bulkOpen && (
              <button
                type="button"
                onClick={() => { setAdding(true); setBulkOpen(false); }}
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add question
              </button>
            )}
          </div>
        </div>

        {/* Locked notice */}
        {isLocked && <LockedBanner />}

        {/* Summary bar */}
        {questions.length > 0 && <SummaryBar questions={questions} competencies={competencies} />}

        {/* Bulk import */}
        {bulkOpen && <BulkImportPanel cycleId={cycleId} onDone={() => setBulkOpen(false)} />}

        {/* Add form */}
        {adding && (
          <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-700">New question</p>
            <QuestionForm
              competencies={competencies}
              defaultValues={{ ...EMPTY, question_no: String(nextQuestionNo) }}
              nextQuestionNo={nextQuestionNo}
              onSubmit={async (values) => {
                const result = await createQuestion(cycleId, values);
                toast.fromResult(result);
                if (!("error" in result)) { setAdding(false); router.refresh(); }
                return result;
              }}
              onCancel={() => setAdding(false)}
              submitLabel="Add"
            />
          </div>
        )}

        <FeedbackLine feedback={feedback} />

        {/* Filter bar */}
        {questions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterSubject}
              onChange={(e) => { setFilterSubject(e.target.value); setPage(1); }}
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-[#191e73]"
              aria-label="Filter by subject"
            >
              <option value="">All subjects</option>
              {competencies.map((c) => (
                <option key={c.competency_id} value={String(c.competency_id)}>
                  {c.competency_name}
                </option>
              ))}
              <option value="__none__">— None assigned —</option>
            </select>
            <input
              type="text"
              value={filterAnswer}
              onChange={(e) => { setFilterAnswer(e.target.value); setPage(1); }}
              placeholder="Filter by answer…"
              className="h-8 rounded-md border border-neutral-300 bg-white px-2.5 text-xs outline-none placeholder:text-neutral-400 focus:border-[#191e73] w-40"
              aria-label="Filter by answer"
            />
            {(filterSubject || filterAnswer) && (
              <button
                type="button"
                onClick={() => { setFilterSubject(""); setFilterAnswer(""); setPage(1); }}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            {(filterSubject || filterAnswer) && (
              <span className="text-xs text-neutral-500 tabular-nums">
                {filtered.length} of {questions.length} shown
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <div className={`${tableStyles.wrap} max-h-[65vh] overflow-y-auto`}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className={tableStyles.headRow}>
                <th className={`${tableStyles.th} w-16`}>
                  <button
                    type="button"
                    onClick={() => setSortAsc((v) => !v)}
                    className="inline-flex items-center gap-1 hover:text-[#191e73]"
                  >
                    Q#{sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className={`${tableStyles.th} w-36`}>Correct answer</th>
                <th className={`${tableStyles.th} w-20 text-right`}>Points</th>
                <th className={`${tableStyles.th} w-44`}>Subject</th>
                <th className={tableStyles.th}>Results</th>
                <th className={`${tableStyles.th} w-28`}>Difficulty</th>
                {canWrite && (
                  <th className={`${tableStyles.th} w-20`}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className={tableStyles.empty}>
                    {questions.length === 0
                      ? canWrite
                        ? 'No questions yet. Use “Add question” or “Bulk import” to get started.'
                        : "No questions for this exam yet."
                      : "No questions match the current filters."}
                  </td>
                </tr>
              )}
              {paged.map((q) =>
                editingId === q.question_id ? (
                  <tr key={q.question_id} className="bg-[#eef0fd]">
                    <td colSpan={colSpan} className={tableStyles.td}>
                      <QuestionForm
                        competencies={competencies}
                        defaultValues={{
                          question_no: String(q.question_no),
                          correct_answer: q.correct_answer,
                          points: String(q.points),
                          competency_id: q.competency_id ? String(q.competency_id) : "",
                        }}
                        nextQuestionNo={nextQuestionNo}
                        onSubmit={async (values) => {
                          const result = await updateQuestion(q.question_id, values);
                          toast.fromResult(result);
                          if (!("error" in result)) { setEditingId(null); router.refresh(); }
                          return result;
                        }}
                        onCancel={() => setEditingId(null)}
                        submitLabel="Save"
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={q.question_id} className={tableStyles.row}>
                    <td className={`${tableStyles.td} font-medium tabular-nums text-[#191e73]`}>
                      Q{q.question_no}
                    </td>
                    <td className={`${tableStyles.td} font-mono`}>{q.correct_answer}</td>
                    <td className={`${tableStyles.td} text-right tabular-nums`}>{q.points}</td>
                    <td className={`${tableStyles.td} text-neutral-600`}>
                      {q.competency_name ?? <span className="italic text-neutral-400">None</span>}
                    </td>
                    <td className={tableStyles.td}>
                      <ResponseCell stat={statMap.get(q.question_id)} />
                    </td>
                    <td className={tableStyles.td}>
                      <DifficultyTag stat={statMap.get(q.question_id)} />
                    </td>
                    {canWrite && (
                      <td className={`${tableStyles.td} text-right`}>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingId(q.question_id); setAdding(false); }}
                            className="rounded p-1 text-neutral-500 hover:bg-[#eef0fd] hover:text-[#191e73]"
                            aria-label={`Edit question ${q.question_no}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDelete(q)}
                            className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Delete question ${q.question_no}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          total={sorted.length}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </div>
    </div>
  );
}
