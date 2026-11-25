"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileUp,
  LayoutGrid,
  ListChecks,
  BookOpenText,
  Copy,
  Lock,
  LockOpen,
  Pencil,
  Shuffle,
  Plus,
  Printer,
  Rows3,
  Search,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { tableStyles } from "@/components/ui/table-styles";
import {
  createQuestion,
  updateQuestion,
  deleteQuestions,
  bulkCreateQuestions,
  bulkCreateQuestionsFromRows,
  previewAnswerKeyFile,
  createExam,
  deleteExamSet,
  duplicateExamSet,
  reshuffleExamSet,
  setExamEditUnlocked,
  updateExam,
} from "@/features/admission/actions/exam-questions";
import {
  CHOICE_KEYS,
  examQuestionSchema,
  examSchema,
  type BulkQuestionRow,
  type ExamQuestionValues,
  type ExamValues,
  type ParsedAnswerRow,
} from "@/features/admission/schemas";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";

// ─── Public types (consumed by page.tsx) ────────────────────────────────────

export type QuestionRow = {
  question_id: number;
  question_no: number;
  /** null for an answer-key-only question. */
  question_text: string | null;
  /** Choices A–D, or null when the question has none. */
  choices: [string, string, string, string] | null;
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
/** Cards are taller than table rows, so fewer per page. */
const CARD_PAGE_SIZE = 10;
const LETTERS = ["A", "B", "C", "D"] as const;

/** One tint per subject (by its position in the subject list); neutral when unassigned. */
const SUBJECT_TONES = [
  "bg-indigo-50 text-indigo-800 ring-indigo-200",
  "bg-sky-50 text-sky-800 ring-sky-200",
  "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "bg-amber-50 text-amber-900 ring-amber-200",
  "bg-rose-50 text-rose-800 ring-rose-200",
  "bg-violet-50 text-violet-800 ring-violet-200",
];

const fieldClass =
  "h-9 w-full rounded-md border border-neutral-400 bg-white px-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const primaryButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60";
const outlineButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60";
/** Shared look for the question list's search / sort controls. */
const toolbarControl =
  "h-9 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
/** Subject dot colors, same order as SUBJECT_TONES. */
const SUBJECT_DOTS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"];

const EMPTY: ExamQuestionValues = {
  question_no: "",
  question_text: "",
  choice_a: "",
  choice_b: "",
  choice_c: "",
  choice_d: "",
  correct_answer: "",
  points: "1",
  competency_id: "",
};

/** Form values for editing an existing question. */
function toFormValues(q: QuestionRow): ExamQuestionValues {
  return {
    question_no: String(q.question_no),
    question_text: q.question_text ?? "",
    choice_a: q.choices?.[0] ?? "",
    choice_b: q.choices?.[1] ?? "",
    choice_c: q.choices?.[2] ?? "",
    choice_d: q.choices?.[3] ?? "",
    correct_answer: q.correct_answer,
    points: String(q.points),
    competency_id: q.competency_id ? String(q.competency_id) : "",
  };
}
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
  schoolYear,
  computedTotal,
  questionCount,
  subjectCount,
  averageCorrect,
  isLocked,
  onEdit,
}: Readonly<{
  examInfo: ExamInfo;
  schoolYear: string;
  computedTotal: number;
  questionCount: number;
  subjectCount: number;
  /** Average % correct across answered questions, or null before anyone took it. */
  averageCorrect: number | null;
  isLocked: boolean;
  onEdit?: () => void;
}>) {
  const { exam_name, exam_date, declared_max, declared_items } = examInfo;

  const maxMismatch = declared_max !== null && declared_max !== computedTotal && computedTotal > 0;
  const itemsMismatch = declared_items !== null && declared_items !== questionCount && questionCount > 0;

  const stats = [
    {
      label: "Questions",
      value: questionCount,
      note: itemsMismatch ? `${declared_items} declared` : null,
      warn: itemsMismatch,
      icon: ListChecks,
    },
    {
      label: "Total points",
      value: computedTotal,
      note: maxMismatch ? `${declared_max} declared` : null,
      warn: maxMismatch,
      icon: Target,
    },
    { label: "Subjects", value: subjectCount, note: null, warn: false, icon: BookOpen },
    {
      label: "Average correct",
      value: averageCorrect === null ? "—" : `${averageCorrect}%`,
      note: averageCorrect === null ? "Not taken yet" : null,
      warn: false,
      icon: BarChart3,
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-500 bg-white/95">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-linear-to-r from-[#191e73] to-[#2f3aa8] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-white/70 uppercase">Admission exam · S.Y. {schoolYear}</p>
          <h2 className="mt-0.5 flex items-center gap-2 text-lg leading-tight font-semibold">
            {exam_name}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Edit exam"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/80">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {exam_date ?? "No exam date set"}
          </p>
        </div>
        {isLocked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/30">
            <Lock className="size-3.5" aria-hidden="true" />
            Locked
          </span>
        ) : (
          <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-medium ring-1 ring-emerald-300/40">
            Editable
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 divide-neutral-200 sm:grid-cols-4 sm:divide-x">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e3e4f8] text-[#191e73]" aria-hidden="true">
              <stat.icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-neutral-600">{stat.label}</p>
              <p className={`text-xl leading-tight font-semibold tabular-nums ${stat.warn ? "text-amber-700" : "text-neutral-900"}`}>
                {stat.value}
              </p>
              {stat.note && <p className="text-[11px] text-neutral-500">{stat.note}</p>}
            </div>
          </div>
        ))}
      </div>

      {(maxMismatch || itemsMismatch) && (
        <p className="flex items-center gap-1.5 border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          The declared exam settings don&apos;t match the current question set. Consider updating the exam or adjusting the questions.
        </p>
      )}
    </section>
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

function LockedBanner({ onUnlock, isPending }: Readonly<{ onUnlock?: () => void; isPending: boolean }>) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>This exam is locked.</strong>{" "}
        The exam date has passed, so questions can&apos;t be added, edited, or deleted. This keeps the answer key
        stable for applicants who have already taken it.
      </span>
      {onUnlock && (
        <button type="button" onClick={onUnlock} disabled={isPending} className={`${outlineButton} h-7 text-xs`}>
          <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Unlock for editing
        </button>
      )}
    </div>
  );
}

function UnlockedBanner({ onLock, isPending }: Readonly<{ onLock?: () => void; isPending: boolean }>) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>Unlocked for editing.</strong> The exam date has passed. Changing a correct answer or deleting a
        question changes the key used for scores already recorded; rescan or re-enter scores if needed.
      </span>
      {onLock && (
        <button type="button" onClick={onLock} disabled={isPending} className={`${outlineButton} h-7 text-xs`}>
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Lock again
        </button>
      )}
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

/** Subject filter chips with question counts and points (replaces the subject dropdown). */
function SubjectChips({
  questions,
  competencies,
  value,
  onChange,
}: Readonly<{
  questions: QuestionRow[];
  competencies: CompetencyOption[];
  value: string;
  onChange: (value: string) => void;
}>) {
  const unassigned = questions.filter((q) => q.competency_id === null).length;
  const chips = [
    { value: "", label: "All", count: questions.length, dot: null as string | null },
    ...competencies.map((c, index) => ({
      value: String(c.competency_id),
      label: c.competency_name,
      count: questions.filter((q) => q.competency_id === c.competency_id).length,
      dot: SUBJECT_DOTS[index % SUBJECT_DOTS.length],
    })),
    ...(unassigned > 0 ? [{ value: "__none__", label: "No subject", count: unassigned, dot: "#a3a3a3" }] : []),
  ].filter((chip) => chip.value === "" || chip.count > 0);

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Filter by subject">
      {chips.map((chip) => {
        const active = value === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
              active
                ? "border-[#191e73] bg-[#191e73] font-semibold text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
            }`}
          >
            {chip.dot && (
              <span
                className={`size-2 rounded-full ${active ? "ring-1 ring-white/70" : ""}`}
                style={{ background: chip.dot }}
                aria-hidden="true"
              />
            )}
            {chip.label}
            <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-neutral-500"}`}>{chip.count}</span>
          </button>
        );
      })}
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
  // Multiple choice (text + A–D) unless editing an answer-key-only question.
  const [mode, setMode] = useState<"choices" | "key">(
    defaultValues.choice_a || !defaultValues.correct_answer ? "choices" : "key",
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ExamQuestionValues>({
    resolver: zodResolver(examQuestionSchema),
    defaultValues,
    mode: "onTouched",
  });

  function switchMode(next: "choices" | "key") {
    setMode(next);
    if (next === "key") for (const key of CHOICE_KEYS) setValue(key, "");
    setValue("correct_answer", "");
  }

  const submit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if ("error" in result) setError(result.error);
    });
  });

  const border = (name: keyof ExamQuestionValues) => (errors[name] ? "border-red-500" : "");
  const fieldError = (name: keyof ExamQuestionValues) =>
    errors[name] ? <span className="text-xs text-red-600">{errors[name]?.message}</span> : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[100px_100px_1fr]">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
          <span>Question no.</span>
          <input
            type="number"
            min={1}
            max={10000}
            placeholder={String(nextQuestionNo)}
            {...register("question_no")}
            aria-invalid={Boolean(errors.question_no)}
            className={`${fieldClass} ${border("question_no")}`}
          />
          {fieldError("question_no")}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
          <span>Points</span>
          <input
            type="number"
            min={1}
            max={1000}
            {...register("points")}
            aria-invalid={Boolean(errors.points)}
            className={`${fieldClass} ${border("points")}`}
          />
          {fieldError("points")}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
          Subject <span className="sr-only">(optional)</span>
          <select {...register("competency_id")} className={`${fieldClass} ${border("competency_id")}`}>
            <option value="">— None —</option>
            {competencies.map((c) => (
              <option key={c.competency_id} value={String(c.competency_id)}>
                {c.competency_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="inline-flex rounded-full border border-neutral-300 bg-white p-0.5 text-xs" role="radiogroup" aria-label="Question type">
        {(
          [
            ["choices", "Multiple choice"],
            ["key", "Answer key only"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => switchMode(value)}
            className={`rounded-full px-3 py-1 ${mode === value ? "bg-[#191e73] font-semibold text-white" : "text-neutral-700 hover:text-black"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "choices" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
            <span>Question</span>
            <textarea
              rows={2}
              maxLength={2000}
              placeholder="Type the question…"
              {...register("question_text")}
              aria-invalid={Boolean(errors.question_text)}
              className={`${fieldClass} h-auto py-2 ${border("question_text")}`}
            />
            {fieldError("question_text")}
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-neutral-700">
              Choices <span className="font-normal text-neutral-500">— select the correct one</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHOICE_KEYS.map((key, index) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm font-semibold text-[#191e73]">
                      <input
                        type="radio"
                        value={LETTERS[index]}
                        {...register("correct_answer")}
                        className="size-4 accent-green-600"
                        aria-label={`Choice ${LETTERS[index]} is correct`}
                      />
                      {LETTERS[index]}
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      placeholder={`Choice ${LETTERS[index]}`}
                      {...register(key)}
                      aria-invalid={Boolean(errors[key])}
                      aria-label={`Choice ${LETTERS[index]}`}
                      className={`${fieldClass} ${border(key)}`}
                    />
                  </div>
                  {fieldError(key)}
                </div>
              ))}
            </div>
            {fieldError("correct_answer")}
          </fieldset>
        </>
      ) : (
        <label className="flex max-w-xs flex-col gap-1 text-xs font-medium text-neutral-700">
          <span>Correct answer</span>
          <input
            type="text"
            maxLength={255}
            placeholder="e.g. A"
            {...register("correct_answer")}
            aria-invalid={Boolean(errors.correct_answer)}
            className={`${fieldClass} ${border("correct_answer")}`}
          />
          {fieldError("correct_answer")}
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-sm border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
        <button type="button" onClick={onCancel} className={outlineButton}>
          Cancel
        </button>
        <button type="submit" disabled={isPending} className={primaryButton}>
          {isPending ? "Saving…" : submitLabel}
        </button>
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

function TabButton({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
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
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">
        Quick way to add an answer key only (no question text). Paste answers separated by spaces, commas, or new
        lines, e.g. <code className="rounded bg-neutral-200 px-1">A B C D A</code>. They are added after the last
        question, 1 point each, no subject.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"A\nB\nC\nD\nA"}
        className="w-full resize-y rounded-md border border-neutral-400 bg-white p-2 font-mono text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20"
      />
      <FeedbackLine feedback={feedback} />
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-xs text-neutral-500 tabular-nums">
          {tokens.length} answer{tokens.length === 1 ? "" : "s"} detected
        </span>
        <button type="button" disabled={isPending || tokens.length === 0} onClick={submit} className={primaryButton}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Importing…" : `Import ${tokens.length || ""} answer${tokens.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function StepTitle({ n, children }: Readonly<{ n: number; children: ReactNode }>) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
      <span className="flex size-5 items-center justify-center rounded-full bg-[#191e73] text-[11px] text-white">{n}</span>
      {children}
    </p>
  );
}

function rowStatus(r: ParsedAnswerRow) {
  if (r.error) return { tone: "text-red-700", bg: "bg-red-50", text: r.error };
  if (r.warning) return { tone: "text-amber-800", bg: "bg-amber-50/70", text: r.warning };
  return { tone: "text-green-700", bg: "", text: "Ready" };
}

function FileImport({ cycleId, existingCount, onDone }: Readonly<{ cycleId: number; existingCount: number; onDone: () => void }>) {
  const router = useRouter();
  const [isParsing, startParse] = useTransition();
  const [isImporting, startImport] = useTransition();
  const [rows, setRows] = useState<ParsedAnswerRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"add" | "update">(existingCount > 0 ? "update" : "add");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const errorCount = rows?.filter((r) => r.error).length ?? 0;
  const warnCount = rows?.filter((r) => !r.error && r.warning).length ?? 0;
  const valid = rows?.filter((r) => !r.error) ?? [];
  const withText = valid.filter((r) => r.question_text).length;
  const shown = (rows ?? []).filter((r) => !onlyProblems || r.error || r.warning);

  function readFile(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) {
      setFeedback({ type: "error", text: "Upload a .csv or .xlsx file." });
      return;
    }
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
    if (valid.length === 0) return;
    setFeedback(null);
    const payload: BulkQuestionRow[] = valid.map((r) => ({
      question_no: r.question_no,
      question_text: r.question_text,
      choice_a: r.choice_a,
      choice_b: r.choice_b,
      choice_c: r.choice_c,
      choice_d: r.choice_d,
      correct_answer: r.correct_answer,
      points: r.points,
      competency_id: r.competency_id,
    }));
    startImport(async () => {
      const result = await bulkCreateQuestionsFromRows(cycleId, payload, mode);
      toast.fromResult(result);
      if ("error" in result) setFeedback({ type: "error", text: result.error });
      else {
        router.refresh();
        onDone();
      }
    });
  }

  const templateHref = (format: "xlsx" | "csv", prefill = false) =>
    `/api/admission/question-template?format=${format}${prefill ? `&prefill=1&cycle=${cycleId}` : ""}`;

  return (
    <div className="space-y-5">
      {/* Step 1 */}
      <section>
        <StepTitle n={1}>Get the template</StepTitle>
        <div className="flex flex-wrap gap-2">
          <a href={templateHref("xlsx")} className={outlineButton}>
            <FileSpreadsheet className="h-4 w-4 text-green-700" aria-hidden="true" />
            Excel template
          </a>
          <a href={templateHref("csv")} className={outlineButton}>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            CSV template
          </a>
          {existingCount > 0 && (
            <a href={templateHref("xlsx", true)} className={outlineButton} title="Download Set A to edit and re-import">
              <FileSpreadsheet className="h-4 w-4 text-[#191e73]" aria-hidden="true" />
              Export current Set A ({existingCount}) for editing
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Columns: <code className="rounded bg-neutral-200 px-1">question_no</code>,{" "}
          <code className="rounded bg-neutral-200 px-1">question_text</code>,{" "}
          <code className="rounded bg-neutral-200 px-1">choice_a</code>–<code className="rounded bg-neutral-200 px-1">choice_d</code>,{" "}
          <code className="rounded bg-neutral-200 px-1">correct_answer</code> (A–D, required),{" "}
          <code className="rounded bg-neutral-200 px-1">points</code>,{" "}
          <code className="rounded bg-neutral-200 px-1">subject</code>. The Excel template has dropdowns for the answer
          and subject.
        </p>
      </section>

      {/* Step 2 */}
      <section>
        <StepTitle n={2}>Upload your file</StepTitle>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            readFile(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
            dragging ? "border-[#191e73] bg-[#f4f5fd]" : "border-neutral-400 bg-white hover:bg-neutral-50"
          }`}
        >
          <FileUp className="size-6 text-[#191e73]" aria-hidden="true" />
          <span className="font-medium text-neutral-900">
            {fileName ? fileName : "Drag a .xlsx or .csv file here, or click to choose"}
          </span>
          <span className="text-xs text-neutral-500">
            {isParsing ? "Reading…" : "Up to 500 questions · about 3 MB"}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      <FeedbackLine feedback={feedback} />

      {/* Step 3 */}
      {rows && rows.length > 0 && (
        <section>
          <StepTitle n={3}>Review and import</StepTitle>

          <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { label: "Rows", value: rows.length, tone: "text-neutral-900" },
              { label: "Ready", value: valid.length, tone: "text-green-700" },
              { label: "Warnings", value: warnCount, tone: warnCount ? "text-amber-700" : "text-neutral-400" },
              { label: "Errors (skipped)", value: errorCount, tone: errorCount ? "text-red-700" : "text-neutral-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-neutral-200 bg-white px-2 py-2">
                <p className={`text-lg leading-tight font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
                <p className="text-[11px] text-neutral-600">{stat.label}</p>
              </div>
            ))}
          </div>

          <fieldset className="mb-3 space-y-1.5 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
            <legend className="px-1 text-xs font-semibold text-neutral-700">Questions that already exist</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="import-mode" checked={mode === "update"} onChange={() => setMode("update")} className="mt-1 accent-[#191e73]" />
              <span>
                <span className="font-medium">Update existing questions with the same number</span>
                <span className="block text-xs text-neutral-600">
                  e.g. add text and choices to your existing answer key. Other rows are added as new.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="import-mode" checked={mode === "add"} onChange={() => setMode("add")} className="mt-1 accent-[#191e73]" />
              <span>
                <span className="font-medium">Add as new questions only</span>
                <span className="block text-xs text-neutral-600">Stops if a question number already exists.</span>
              </span>
            </label>
          </fieldset>

          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-neutral-600">
              {withText} of {valid.length} ready row{valid.length === 1 ? "" : "s"} include question text
            </span>
            {(errorCount > 0 || warnCount > 0) && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-[#191e73]" />
                Show only rows with issues
              </label>
            )}
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Row</th>
                  <th className="px-2 py-1.5 text-left font-medium">Q#</th>
                  <th className="px-2 py-1.5 text-left font-medium">Question &amp; choices</th>
                  <th className="px-2 py-1.5 text-left font-medium">Ans</th>
                  <th className="px-2 py-1.5 text-right font-medium">Pts</th>
                  <th className="px-2 py-1.5 text-left font-medium">Subject</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {shown.map((r) => {
                  const status = rowStatus(r);
                  const choices = [r.choice_a, r.choice_b, r.choice_c, r.choice_d];
                  return (
                    <tr key={r.rowNumber} className={`align-top ${status.bg}`}>
                      <td className="px-2 py-1.5 text-neutral-500 tabular-nums">{r.rowNumber}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.question_no ?? "auto"}</td>
                      <td className="max-w-sm px-2 py-1.5">
                        <span className="line-clamp-2 text-neutral-900">
                          {r.question_text ?? <span className="text-neutral-400 italic">No question text</span>}
                        </span>
                        {choices.some(Boolean) && (
                          <span className="mt-0.5 block truncate text-[11px] text-neutral-600">
                            {choices.map((c, index) => (
                              <span key={LETTERS[index]} className={LETTERS[index] === r.correct_answer ? "font-semibold text-green-700" : ""}>
                                {LETTERS[index]}) {c ?? "—"}
                                {index < 3 ? "   " : ""}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-semibold">{r.correct_answer || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.points}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.competency_label || "—"}</td>
                      <td className={`px-2 py-1.5 ${status.tone}`}>{status.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-neutral-200 pt-3">
            {errorCount > 0 && (
              <span className="mr-auto text-xs text-red-700">
                {errorCount} row{errorCount === 1 ? "" : "s"} with errors will be skipped.
              </span>
            )}
            <button type="button" disabled={valid.length === 0 || isImporting} onClick={confirmImport} className={primaryButton}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isImporting ? "Importing…" : `Import ${valid.length} question${valid.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function BulkImportPanel({
  open,
  cycleId,
  existingCount,
  onDone,
}: Readonly<{ open: boolean; cycleId: number; existingCount: number; onDone: () => void }>) {
  const [tab, setTab] = useState<"file" | "paste">("file");
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
      title="Bulk import questions"
      description="Add or update many questions at once from Excel or CSV. Imports go to Set A."
    >
      <div className="mb-4 flex gap-1 border-b border-neutral-200" role="tablist">
        <TabButton active={tab === "file"} onClick={() => setTab("file")}>
          Upload Excel / CSV
        </TabButton>
        <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
          Paste answer key
        </TabButton>
      </div>
      {tab === "file" ? (
        <FileImport cycleId={cycleId} existingCount={existingCount} onDone={onDone} />
      ) : (
        <PasteImport cycleId={cycleId} onDone={onDone} />
      )}
    </Modal>
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
  set,
  onClose,
}: Readonly<{
  examInfo: ExamInfo | null;
  schoolYear: string;
  questions: QuestionRow[];
  competencies: CompetencyOption[];
  set: string;
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
        <span className="text-sm font-medium text-neutral-700">Answer key preview · Set {set}</span>
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
          <p className="text-sm font-semibold">Answer key · Set {set}</p>
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

// ─── Test booklet (questions + choices, for applicants to read) ──────────────

function TestBooklet({
  examInfo,
  schoolYear,
  set,
  questions,
  onClose,
}: Readonly<{
  examInfo: ExamInfo | null;
  schoolYear: string;
  set: string;
  questions: QuestionRow[];
  onClose: () => void;
}>) {
  const sorted = [...questions].sort((a, b) => a.question_no - b.question_no);
  const totalPoints = sorted.reduce((s, q) => s + q.points, 0);

  return (
    <div className="test-booklet-print fixed inset-0 z-50 overflow-auto bg-white">
      <style>{`@media print {
        body { visibility: hidden !important; }
        .test-booklet-print, .test-booklet-print * { visibility: visible !important; }
        .test-booklet-print { position: absolute; inset: 0; overflow: visible; }
        .no-print { display: none !important; }
        .tb-item { break-inside: avoid; }
      }`}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-300 bg-neutral-50 px-4 py-2">
        <span className="text-sm font-medium text-neutral-700">Test booklet preview · Set {set}</span>
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
        <header className="mb-4 border-b-2 border-neutral-800 pb-3 text-center">
          <p className="text-xs font-semibold tracking-widest text-neutral-600 uppercase">Quezon City University</p>
          <h1 className="text-xl font-bold">{examInfo?.exam_name ?? "Admission Exam"}</h1>
          <p className="text-sm text-neutral-700">
            S.Y. {schoolYear}
            {examInfo?.exam_date ? ` · ${examInfo.exam_date}` : ""} · {sorted.length} items · {totalPoints} points
          </p>
          <p className="mt-1 inline-block rounded border-2 border-neutral-800 px-3 py-0.5 text-lg font-bold tracking-wider">
            SET {set}
          </p>
          <p className="mt-2 text-xs text-neutral-600">
            Read each question and shade your answer on the separate answer sheet. Do not write on this booklet.
          </p>
        </header>

        {sorted.length === 0 ? (
          <p className="text-center text-sm text-neutral-500">No questions to show.</p>
        ) : (
          <ol className="columns-1 gap-8 text-sm sm:columns-2 print:columns-2">
            {sorted.map((q) => (
              <li key={q.question_id} className="tb-item mb-4">
                <p className="leading-snug">
                  <span className="mr-1 font-bold tabular-nums">{q.question_no}.</span>
                  {q.question_text ?? <span className="text-neutral-400 italic">(no question text)</span>}
                </p>
                {q.choices && (
                  <ol className="mt-1 space-y-0.5 pl-5">
                    {q.choices.map((choice, index) => (
                      <li key={LETTERS[index]}>
                        <span className="mr-1 font-semibold">{LETTERS[index]}.</span>
                        {choice}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
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

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  stat,
  subjectTone,
  canWrite,
  selectable,
  isPending,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: Readonly<{
  question: QuestionRow;
  stat: ResponseStat | undefined;
  subjectTone: string;
  canWrite: boolean;
  /** Bulk delete mode: show the checkbox. */
  selectable: boolean;
  isPending: boolean;
  /** Ticked for bulk delete. */
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  const answer = question.correct_answer.trim().toUpperCase();
  return (
    <li
      className={`rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm ${
        selected ? "border-[#191e73] ring-2 ring-[#191e73]/20" : "border-neutral-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select question ${question.question_no}`}
            className="size-4 cursor-pointer accent-[#191e73]"
          />
        )}
        <span className="inline-flex h-7 min-w-11 items-center justify-center rounded-md bg-[#191e73] px-2 text-sm font-semibold text-white tabular-nums">
          Q{question.question_no}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${subjectTone}`}>
          {question.competency_name ?? "No subject"}
        </span>
        <span className="text-xs text-neutral-600 tabular-nums">
          {question.points} pt{question.points === 1 ? "" : "s"}
        </span>
        <DifficultyTag stat={stat} />
        {canWrite && (
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-neutral-500 hover:bg-[#eef0fd] hover:text-[#191e73]"
              aria-label={`Edit question ${question.question_no}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onDelete}
              className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700"
              aria-label={`Delete question ${question.question_no}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>

      {question.question_text ? (
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-900">{question.question_text}</p>
      ) : (
        <p className="mt-3 text-sm text-neutral-500 italic">No question text. Answer key only.</p>
      )}

      {question.choices ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {question.choices.map((choice, index) => {
            const letter = LETTERS[index];
            const correct = letter === answer;
            return (
              <li
                key={letter}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  correct ? "border-green-500 bg-green-50 text-green-950" : "border-neutral-200 bg-neutral-50/60 text-neutral-800"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    correct ? "bg-green-600 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-300"
                  }`}
                  aria-hidden="true"
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="sr-only">{letter}. </span>
                  {choice}
                  {correct && <span className="sr-only"> (correct answer)</span>}
                </span>
                {correct && <Check className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-green-500 bg-green-50 px-3 py-1.5 text-sm text-green-950">
          <Check className="size-4 text-green-700" aria-hidden="true" />
          Correct answer: <span className="font-mono font-semibold">{question.correct_answer}</span>
        </p>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-2">
        <ResponseCell stat={stat} />
      </div>
    </li>
  );
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
  canManage = canWrite,
  isLocked,
  isUnlocked = false,
  currentSet = "A",
  setCounts = { A: questions.length, B: 0 },
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
  /** May add / edit / delete questions now (write access and not locked). */
  canWrite: boolean;
  /** Has Admission write access (can unlock / re-lock a locked exam). */
  canManage?: boolean;
  isLocked: boolean;
  /** Exam date passed but unlocked for editing. */
  isUnlocked?: boolean;
  /** Set shown ("A" / "B"). */
  currentSet?: "A" | "B";
  setCounts?: { A: number; B: number };
  yearFilter?: ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showBooklet, setShowBooklet] = useState(false);
  const hasSetB = setCounts.B > 0;

  function goToSet(set: "A" | "B") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("set", set);
    setEditingId(null);
    setAdding(false);
    setSelected(new Set());
    setSelectMode(false);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [filterSubject, setFilterSubject] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");

  const computedTotal = questions.reduce((s, q) => s + q.points, 0);
  const nextQuestionNo = questions.length > 0 ? Math.max(...questions.map((q) => q.question_no)) + 1 : 1;

  const statMap = new Map(responseStats.map((s) => [s.question_id, s]));
  const subjectTone = (competencyId: number | null) => {
    const index = competencies.findIndex((c) => c.competency_id === competencyId);
    return index === -1 ? "bg-neutral-100 text-neutral-700 ring-neutral-300" : SUBJECT_TONES[index % SUBJECT_TONES.length];
  };
  const subjectCount = new Set(questions.map((q) => q.competency_id).filter((id) => id !== null)).size;
  const answered = responseStats.filter((s) => s.correct + s.wrong > 0);
  const averageCorrect = answered.length
    ? Math.round(
        (answered.reduce((sum, s) => sum + s.correct / (s.correct + s.wrong), 0) / answered.length) * 100,
      )
    : null;

  // Apply filters then sort. Search matches the number, text, choices and answer.
  const search = query.trim().toLowerCase();
  const filtered = questions.filter((q) => {
    if (filterSubject) {
      if (filterSubject === "__none__") {
        if (q.competency_id !== null) return false;
      } else if (String(q.competency_id) !== filterSubject) {
        return false;
      }
    }
    if (!search) return true;
    const haystack = [String(q.question_no), `q${q.question_no}`, q.question_text ?? "", q.correct_answer, ...(q.choices ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
  const sorted = [...filtered].sort((a, b) =>
    sortAsc ? a.question_no - b.question_no : b.question_no - a.question_no,
  );

  const pageSize = view === "cards" ? CARD_PAGE_SIZE : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const paged = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      toast.fromResult(result);
      setFeedback("error" in result ? { type: "error", text: result.error } : null);
      onDone?.();
      if (!("error" in result)) router.refresh();
    });
  }

  /** Set B action waiting for confirmation in the dialog (null = closed). */
  const [setAction, setSetAction] = useState<"duplicate" | "reshuffle" | "delete" | null>(null);
  /** Questions ticked for bulk delete. */
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  /** Questions waiting for the delete confirmation (null = dialog closed). */
  const [deleting, setDeleting] = useState<QuestionRow[] | null>(null);
  /** Bulk delete mode: checkboxes only show after clicking "Bulk delete". */
  const [selectMode, setSelectMode] = useState(false);
  const showChecks = canWrite && selectMode;
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }
  const SET_ACTIONS = {
    duplicate: {
      title: "Create Set B",
      heading: `Copy all ${setCounts.A} Set A questions into Set B?`,
      description:
        "Each question's choices are reshuffled so its correct answer moves to a different letter. Question text, points and subjects stay the same. You can choose which sessions take Set B on the Exam Schedule.",
      confirmLabel: "Create Set B",
      tone: "primary" as const,
      action: () => duplicateExamSet(examId as number),
    },
    reshuffle: {
      title: "Reshuffle Set B",
      heading: `Reshuffle the choices of all ${setCounts.B} Set B questions?`,
      description:
        "Set B gets a new answer key: each correct answer moves to a different letter. Print new Set B answer keys and booklets afterwards. This isn't allowed once Set B has recorded answers.",
      confirmLabel: "Reshuffle Set B",
      tone: "warning" as const,
      action: () => reshuffleExamSet(examId as number),
    },
    delete: {
      title: "Delete Set B",
      heading: `Delete Set B and its ${setCounts.B} questions?`,
      description:
        "Set A is not affected. This isn't allowed while an exam session uses Set B or Set B has recorded answers. You can create Set B again from Set A later.",
      confirmLabel: "Delete Set B",
      tone: "danger" as const,
      action: async () => {
        const result = await deleteExamSet(examId as number);
        if (!("error" in result)) goToSet("A");
        return result;
      },
    },
  };
  const pendingSetAction = setAction ? SET_ACTIONS[setAction] : null;

  function handleDelete(q: QuestionRow) {
    setDeleting([q]);
  }

  // Bulk delete: ticked questions (only ones still in the current set count).
  const selectedRows = questions.filter((q) => selected.has(q.question_id));
  const allShownSelected = sorted.length > 0 && sorted.every((q) => selected.has(q.question_id));
  function toggleSelected(questionId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }
  function toggleAllShown() {
    setSelected(allShownSelected ? new Set() : new Set(sorted.map((q) => q.question_id)));
  }

  function confirmDelete() {
    if (!deleting) return;
    const ids = deleting.map((q) => q.question_id);
    run(
      () => deleteQuestions(ids),
      () => {
        setDeleting(null);
        setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
        // A bulk delete closes bulk-delete mode.
        if (selectMode) setSelectMode(false);
      },
    );
  }

  // What the delete dialog says: which questions, and whether answers go with them.
  const deletingNumbers = (deleting ?? []).map((q) => `Q${q.question_no}`).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const deletingAnswered = (deleting ?? []).filter((q) => {
    const stat = statMap.get(q.question_id);
    return stat !== undefined && stat.correct + stat.wrong > 0;
  }).length;
  const deletingList =
    deletingNumbers.length > 8 ? `${deletingNumbers.slice(0, 8).join(", ")} and ${deletingNumbers.length - 8} more` : deletingNumbers.join(", ");
  let deleteDescription = `They're removed from Set ${currentSet} only; the other set isn't changed.`;
  if (deleting?.length === 1) deleteDescription = `It's removed from Set ${currentSet} only; the other set isn't changed.`;
  if (deletingAnswered > 0) {
    deleteDescription += ` ${deletingAnswered === 1 ? "One has" : `${deletingAnswered} have`} recorded answers; those answers are deleted too and Item Analysis changes. Saved scores aren't recalculated.`;
  }

  const tableColumns = 7 + (canWrite ? 1 : 0) + (showChecks ? 1 : 0);

  function startEdit(questionId: number) {
    setEditingId(questionId);
    setAdding(false);
  }

  async function saveEdit(questionId: number, values: ExamQuestionValues) {
    const result = await updateQuestion(questionId, values);
    toast.fromResult(result);
    if (!("error" in result)) {
      setEditingId(null);
      router.refresh();
    }
    return result;
  }

  let emptyText = "No questions match the current filters.";
  if (questions.length === 0) {
    emptyText = canWrite
      ? "No questions yet. Use “Add question” or “Bulk import” to get started."
      : "No questions for this exam yet.";
  }

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
      {showBooklet && (
        <TestBooklet
          examInfo={examInfo}
          schoolYear={schoolYear}
          set={currentSet}
          questions={questions}
          onClose={() => setShowBooklet(false)}
        />
      )}
      {showPrint && (
        <PrintPreview
          examInfo={examInfo}
          schoolYear={schoolYear}
          questions={questions}
          competencies={competencies}
          set={currentSet}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* Exam overview / edit form */}
      {examInfo &&
        (editingExam && examDefaults ? (
          <div className="space-y-2 rounded-xl border border-neutral-500 bg-white/95 px-4 py-3">
            <p className="text-sm font-semibold text-[#191e73]">Edit exam</p>
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
            schoolYear={schoolYear}
            computedTotal={computedTotal}
            questionCount={questions.length}
            subjectCount={subjectCount}
            averageCorrect={averageCorrect}
            isLocked={isLocked}
            onEdit={canWrite ? () => setEditingExam(true) : undefined}
          />
        ))}

      {/* Main card */}
      <section className="space-y-3 rounded-xl border border-neutral-500 bg-white/95 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <ListChecks className="size-4 text-[#191e73]" aria-hidden="true" />
              Questions
            </h2>
            {yearFilter}
          </div>
          <div className="flex flex-wrap gap-2">
            {questions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBooklet(true)}
                className={outlineButton}
                title="Questions and choices for applicants to read (no answers)"
              >
                <BookOpenText className="h-4 w-4" aria-hidden="true" />
                Test booklet
              </button>
            )}
            {questions.length > 0 && (
              <button type="button" onClick={() => setShowPrint(true)} className={outlineButton}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Answer key
              </button>
            )}
            {questions.length > 0 && <AnswerSheetButton cycleId={cycleId} sessions={examSessions} />}
            {canWrite && currentSet === "A" && !bulkOpen && !adding && (
              <button type="button" onClick={() => setBulkOpen(true)} className={outlineButton}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Bulk import
              </button>
            )}
            {canWrite && questions.length > 0 && !selectMode && (
              <button
                type="button"
                onClick={() => {
                  setSelectMode(true);
                  setEditingId(null);
                }}
                className={`${outlineButton} text-red-700 hover:bg-red-50`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Bulk delete
              </button>
            )}
            {canWrite && !adding && !bulkOpen && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setBulkOpen(false);
                  setEditingId(null);
                }}
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add question
              </button>
            )}
          </div>
        </div>

        {isLocked && (
          <LockedBanner
            isPending={isPending}
            onUnlock={canManage ? () => run(() => setExamEditUnlocked(examId, true)) : undefined}
          />
        )}
        {isUnlocked && (
          <UnlockedBanner
            isPending={isPending}
            onLock={canManage ? () => run(() => setExamEditUnlocked(examId, false)) : undefined}
          />
        )}

        {/* Exam sets */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-neutral-300 bg-neutral-100 p-0.5" role="tablist" aria-label="Exam set">
            {(["A", "B"] as const)
              .filter((set) => set === "A" || hasSetB)
              .map((set) => (
                <button
                  key={set}
                  type="button"
                  role="tab"
                  aria-selected={currentSet === set}
                  onClick={() => goToSet(set)}
                  className={`rounded-full px-4 py-1 text-sm ${
                    currentSet === set ? "bg-[#191e73] font-semibold text-white shadow-sm" : "text-neutral-700 hover:text-black"
                  }`}
                >
                  Set {set} <span className="tabular-nums opacity-80">· {setCounts[set]}</span>
                </button>
              ))}
          </div>
          {canWrite && !hasSetB && setCounts.A > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setSetAction("duplicate")}
              className={outlineButton}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate as Set B
            </button>
          )}
          {canWrite && hasSetB && currentSet === "B" && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setSetAction("reshuffle")}
                className={outlineButton}
              >
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                Reshuffle Set B
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setSetAction("delete")}
                className={`${outlineButton} text-red-700 hover:bg-red-50`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete Set B
              </button>
            </>
          )}
          {hasSetB && (
            <span className="text-xs text-neutral-600">
              Same questions; Set B&apos;s choices are reshuffled. Choose each session&apos;s set on the Exam Schedule.
            </span>
          )}
        </div>

        <BulkImportPanel open={bulkOpen} cycleId={cycleId} existingCount={setCounts.A} onDone={() => setBulkOpen(false)} />

        <Modal
          open={adding}
          onOpenChange={(next) => {
            if (!next) setAdding(false);
          }}
          title={`New question · Set ${currentSet}`}
          description="Type the question and its four choices, then select the correct one."
          dismissible={false}
        >
          {adding && (
            <QuestionForm
              competencies={competencies}
              defaultValues={{ ...EMPTY, question_no: String(nextQuestionNo) }}
              nextQuestionNo={nextQuestionNo}
              onSubmit={async (values) => {
                const result = await createQuestion(cycleId, values, currentSet);
                toast.fromResult(result);
                if (!("error" in result)) {
                  setAdding(false);
                  router.refresh();
                }
                return result;
              }}
              onCancel={() => setAdding(false)}
              submitLabel="Add question"
            />
          )}
        </Modal>

        <ConfirmModal
          open={pendingSetAction !== null}
          onCancel={() => setSetAction(null)}
          onConfirm={() => {
            if (pendingSetAction) run(pendingSetAction.action, () => setSetAction(null));
          }}
          isPending={isPending}
          tone={pendingSetAction?.tone ?? "primary"}
          title={pendingSetAction?.title ?? ""}
          heading={pendingSetAction?.heading}
          description={pendingSetAction?.description ?? ""}
          confirmLabel={isPending ? "Working…" : (pendingSetAction?.confirmLabel ?? "Confirm")}
        />

        <FeedbackLine feedback={feedback} />

        {questions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-neutral-300 bg-white">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <label className="relative min-w-55 flex-1 sm:max-w-md">
                <span className="sr-only">Search questions</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search question, choice, or Q#"
                  className={`${toolbarControl} w-full pr-3 pl-9 placeholder:text-neutral-400`}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <span className="sr-only sm:not-sr-only">Sort</span>
                <select
                  value={sortAsc ? "asc" : "desc"}
                  onChange={(e) => setSortAsc(e.target.value === "asc")}
                  className={`${toolbarControl} px-2.5`}
                  aria-label="Sort questions"
                >
                  <option value="asc">Question 1 first</option>
                  <option value="desc">Last question first</option>
                </select>
              </label>
              {(filterSubject || search) && (
                <span className="flex items-center gap-2 text-sm text-neutral-600">
                  <span className="tabular-nums">
                    {filtered.length} of {questions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterSubject("");
                      setQuery("");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[#191e73] hover:bg-[#eef0fd]"
                  >
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </button>
                </span>
              )}
              <div
                className="ml-auto inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-neutral-50 p-0.5"
                role="radiogroup"
                aria-label="View"
              >
                {(
                  [
                    ["cards", "Cards", LayoutGrid],
                    ["table", "Compact", Rows3],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={view === value}
                    onClick={() => {
                      setView(value);
                      setPage(1);
                    }}
                    className={`inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm ${
                      view === value ? "bg-white font-semibold text-[#191e73] shadow-sm ring-1 ring-neutral-300" : "text-neutral-600 hover:text-black"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-neutral-200 bg-neutral-50/70 px-3 py-2.5">
              <span className="shrink-0 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Subject</span>
              <SubjectChips
                questions={questions}
                competencies={competencies}
                value={filterSubject}
                onChange={(value) => {
                  setFilterSubject(value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        )}

        {/* Bulk selection */}
        {showChecks && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm shadow-sm">
            <label className="flex cursor-pointer items-center gap-2 text-neutral-800">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={toggleAllShown}
                className="size-4 cursor-pointer accent-[#191e73]"
              />
              Select all {sorted.length} shown
            </label>
            <span className={selectedRows.length ? "font-semibold text-red-800 tabular-nums" : "text-neutral-600"}>
              {selectedRows.length ? `${selectedRows.length} selected` : "Tick the questions to delete"}
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={exitSelectMode} disabled={isPending} className={outlineButton}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || selectedRows.length === 0}
                onClick={() => setDeleting(selectedRows)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete {selectedRows.length || ""} question{selectedRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        <ConfirmModal
          open={deleting !== null}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
          isPending={isPending}
          tone="danger"
          title={deleting && deleting.length > 1 ? `Delete ${deleting.length} questions` : "Delete question"}
          heading={deletingList ? `Delete ${deletingList}?` : undefined}
          description={`${deleteDescription} This can't be undone.`}
          confirmLabel={isPending ? "Deleting…" : "Delete"}
        />

        {paged.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center">
            <ListChecks className="mx-auto size-8 text-neutral-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-neutral-600">{emptyText}</p>
          </div>
        )}

        {view === "cards" && paged.length > 0 && (
          <ol className="space-y-3">
            {paged.map((q) =>
              editingId === q.question_id ? (
                <li key={q.question_id} className="rounded-xl border border-[#191e73]/30 bg-[#f4f5fd] p-4">
                  <p className="mb-3 text-sm font-semibold text-[#191e73]">Edit question {q.question_no}</p>
                  <QuestionForm
                    competencies={competencies}
                    defaultValues={toFormValues(q)}
                    nextQuestionNo={nextQuestionNo}
                    onSubmit={(values) => saveEdit(q.question_id, values)}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save changes"
                  />
                </li>
              ) : (
                <QuestionCard
                  key={q.question_id}
                  question={q}
                  stat={statMap.get(q.question_id)}
                  subjectTone={subjectTone(q.competency_id)}
                  canWrite={canWrite}
                  selectable={showChecks}
                  isPending={isPending}
                  selected={selected.has(q.question_id)}
                  onToggle={() => toggleSelected(q.question_id)}
                  onEdit={() => startEdit(q.question_id)}
                  onDelete={() => handleDelete(q)}
                />
              ),
            )}
          </ol>
        )}

        {view === "table" && paged.length > 0 && (
          <div className={`${tableStyles.wrap} max-h-[65vh] overflow-y-auto`}>
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className={tableStyles.headRow}>
                  {showChecks && (
                    <th className={`${tableStyles.th} w-10`}>
                      <input
                        type="checkbox"
                        checked={allShownSelected}
                        onChange={toggleAllShown}
                        aria-label="Select all questions shown"
                        className="size-4 cursor-pointer accent-[#191e73]"
                      />
                    </th>
                  )}
                  <th className={`${tableStyles.th} w-16`}>Q#</th>
                  <th className={tableStyles.th}>Question</th>
                  <th className={`${tableStyles.th} w-20`}>Answer</th>
                  <th className={`${tableStyles.th} w-16 text-right`}>Pts</th>
                  <th className={`${tableStyles.th} w-40`}>Subject</th>
                  <th className={`${tableStyles.th} w-56`}>Results</th>
                  <th className={`${tableStyles.th} w-24`}>Difficulty</th>
                  {canWrite && (
                    <th className={`${tableStyles.th} w-20`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className={tableStyles.body}>
                {paged.map((q) =>
                  editingId === q.question_id ? (
                    <tr key={q.question_id} className="bg-[#eef0fd]">
                      <td colSpan={tableColumns} className={tableStyles.td}>
                        <QuestionForm
                          competencies={competencies}
                          defaultValues={toFormValues(q)}
                          nextQuestionNo={nextQuestionNo}
                          onSubmit={(values) => saveEdit(q.question_id, values)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="Save changes"
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={q.question_id} className={tableStyles.row}>
                      {showChecks && (
                        <td className={tableStyles.td}>
                          <input
                            type="checkbox"
                            checked={selected.has(q.question_id)}
                            onChange={() => toggleSelected(q.question_id)}
                            aria-label={`Select question ${q.question_no}`}
                            className="size-4 cursor-pointer accent-[#191e73]"
                          />
                        </td>
                      )}
                      <td className={`${tableStyles.td} font-medium text-[#191e73] tabular-nums`}>Q{q.question_no}</td>
                      <td className={`${tableStyles.td} max-w-md`}>
                        <span className="line-clamp-2 text-neutral-800" title={q.question_text ?? undefined}>
                          {q.question_text ?? <span className="text-neutral-400 italic">Answer key only</span>}
                        </span>
                      </td>
                      <td className={`${tableStyles.td} font-mono font-semibold`}>{q.correct_answer}</td>
                      <td className={`${tableStyles.td} text-right tabular-nums`}>{q.points}</td>
                      <td className={tableStyles.td}>
                        <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${subjectTone(q.competency_id)}`}>
                          {q.competency_name ?? "None"}
                        </span>
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
                              onClick={() => startEdit(q.question_id)}
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
        )}

        <Pagination page={clampedPage} totalPages={totalPages} total={sorted.length} pageSize={pageSize} onPage={setPage} />
      </section>
    </div>
  );
}
