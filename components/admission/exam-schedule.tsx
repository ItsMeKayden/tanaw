"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  Lock,
  MapPin,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { tableStyles } from "@/components/ui/table-styles";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import {
  archiveExamSession,
  createExamSession,
  fillSessionSlots,
  removeFromSession,
  restoreExamSession,
  saveAttendance,
} from "@/features/admission/actions/exam-schedule";
import { manilaTodayIso } from "@/features/admission/exam-scoring";
import { examSessionSchema, type ExamSessionValues } from "@/features/admission/schemas";
import { toast } from "@/components/ui/toaster";

export type SessionRow = {
  session_id: number;
  date: string;
  /** e.g. "Saturday". */
  weekday: string;
  time: string | null;
  end_time: string | null;
  /** Start to end, in minutes (null when a time is missing). */
  duration_minutes: number | null;
  venue: string;
  room: string | null;
  capacity: number;
  registered: number;
  present: number;
  absent: number;
  finished: boolean;
  /** Archived (instead of deleted): read-only until restored. */
  archived: boolean;
};

export type SlotRow = {
  application_id: number;
  application_no: string;
  name: string;
  attendance: "PRESENT" | "ABSENT" | null;
  /** Has an exam score: can't be changed to absent or removed from the session. */
  scored: boolean;
};

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { error: string } | { success: true; message: string };
type Tab = "upcoming" | "finished" | "archived";

const fieldClass =
  "h-9 w-full rounded-md border bg-white px-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const primaryButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60";
const outlineButton =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-60";

function FeedbackLine({ feedback }: Readonly<{ feedback: Feedback }>) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.type === "error" ? "alert" : "status"}
      className={`rounded-sm border p-2 text-xs ${
        feedback.type === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"
      }`}
    >
      {feedback.text}
    </p>
  );
}

/** "2 hrs", "1 hr 30 min", "45 min". */
function formatDuration(minutes: number | null) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hr${h === 1 ? "" : "s"}` : "";
  const mins = m ? `${m} min` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** "8:00 AM – 10:00 AM"; sessions made before end times were required may lack one. */
function timeRange(session: SessionRow) {
  if (!session.time) return "No time set";
  return session.end_time ? `${session.time} – ${session.end_time}` : `${session.time} – (no end time)`;
}

function StatusBadge({ session }: Readonly<{ session: SessionRow }>) {
  if (session.archived) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300 ring-inset">
        <Archive className="size-3" aria-hidden="true" />
        Archived
      </span>
    );
  }
  return session.finished ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 ring-1 ring-neutral-300 ring-inset">
      <Lock className="size-3" aria-hidden="true" />
      Finished
    </span>
  ) : (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200 ring-inset">
      Upcoming
    </span>
  );
}

// ---------------------------------------------------------------------------
// New session (modal)
// ---------------------------------------------------------------------------

const EMPTY_SESSION: ExamSessionValues = { session_date: "", start_time: "", end_time: "", venue: "", room: "", capacity: "" };

function toMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function NewSessionModal({
  open,
  cycleId,
  onClose,
}: Readonly<{ open: boolean; cycleId: number; onClose: (sessionId?: number) => void }>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset,
    formState: { errors, isDirty },
  } = useForm<ExamSessionValues>({
    resolver: zodResolver(examSessionSchema),
    defaultValues: EMPTY_SESSION,
    mode: "onTouched",
  });

  const [start, end] = useWatch({ control, name: ["start_time", "end_time"] });
  const startMin = toMinutes(start ?? "");
  const endMin = toMinutes(end ?? "");
  const duration = startMin !== null && endMin !== null && endMin > startMin ? formatDuration(endMin - startMin) : null;

  function close(sessionId?: number) {
    reset(EMPTY_SESSION);
    setError(null);
    onClose(sessionId);
  }

  const submit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await createExamSession(cycleId, values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      close(result.sessionId);
    });
  });

  const border = (name: keyof ExamSessionValues) => (errors[name] ? "border-red-500" : "border-neutral-400");

  const field = (
    name: keyof ExamSessionValues,
    label: string,
    props: ComponentProps<"input">,
    { optional = false, className = "" }: { optional?: boolean; className?: string } = {},
  ) => (
    <label className={`flex flex-col gap-1 text-sm text-neutral-800 ${className}`}>
      <span className="font-medium">
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-neutral-500">(optional)</span>
        ) : (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <input
        {...props}
        {...register(name)}
        required={!optional}
        aria-invalid={Boolean(errors[name])}
        className={`${fieldClass} ${border(name)}`}
      />
      {errors[name] && <span className="text-xs text-red-600">{errors[name]?.message}</span>}
    </label>
  );

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) close();
      }}
      title="New exam session"
      description="Applicants in the For Examination stage can then be seated in it."
      size="sm"
      dismissible={!isDirty}
    >
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm text-neutral-800 sm:col-span-2">
          <label htmlFor="session-date" className="font-medium">
            Exam date
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <Controller
            control={control}
            name="session_date"
            render={({ field: { value, onChange } }) => (
              <DatePicker
                id="session-date"
                value={value}
                onChange={onChange}
                onClose={() => void trigger("session_date")}
                min={manilaTodayIso()}
                placeholder="Select exam date"
                invalid={Boolean(errors.session_date)}
                className={`${fieldClass} ${border("session_date")}`}
              />
            )}
          />
          {errors.session_date && <span className="text-xs text-red-600">{errors.session_date.message}</span>}
        </div>

        {field("start_time", "Start time", { type: "time" })}
        {field("end_time", "End time", { type: "time" })}
        <p className="-mt-1 flex items-center gap-1.5 text-xs text-neutral-600 sm:col-span-2" aria-live="polite">
          <Clock className="size-3.5" aria-hidden="true" />
          {duration ? `Duration: ${duration}` : "Set both times to see the duration. The session locks after its end time."}
        </p>

        {field("venue", "Venue", { placeholder: "e.g. QCU San Bartolome Campus, Main Building", maxLength: 150 }, { className: "sm:col-span-2" })}
        {field("room", "Room", { placeholder: "e.g. 204", maxLength: 50 }, { optional: true })}
        {field("capacity", "Capacity", { type: "number", min: 1, max: 1000, inputMode: "numeric", placeholder: "e.g. 40" })}

        {error && (
          <p role="alert" className="rounded-sm border border-red-300 bg-red-50 p-2 text-xs text-red-800 sm:col-span-2">
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2 border-t border-neutral-200 pt-3 sm:col-span-2">
          <button type="button" onClick={() => close()} disabled={isPending} className={outlineButton}>
            Cancel
          </button>
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? "Adding…" : "Add session"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Attendance panel
// ---------------------------------------------------------------------------

function AttendancePanel({
  session,
  slots,
  waiting,
  canWrite,
  feedback,
  setFeedback,
}: Readonly<{
  session: SessionRow;
  slots: SlotRow[];
  waiting: number;
  canWrite: boolean;
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [present, setPresent] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(slots.map((s) => [s.application_id, s.attendance === "PRESENT"])),
  );
  const [touched, setTouched] = useState(false);

  const run = (action: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      toast.fromResult(result);
      setFeedback("error" in result ? { type: "error", text: result.error } : null);
      if (!("error" in result)) {
        setTouched(false);
        router.refresh();
      }
    });
  };

  const open = session.capacity - slots.length;
  const toFill = Math.min(open, waiting);
  const duration = formatDuration(session.duration_minutes);
  // Finished and archived sessions are read-only.
  const locked = session.finished || session.archived;

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-500 bg-white/95">
      <header className="border-b border-neutral-200 bg-[#f4f5fd] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-[#191e73] uppercase">Attendance</p>
            <h2 className="mt-0.5 text-lg leading-tight font-semibold">{session.date}</h2>
            <p className="text-sm text-neutral-600">{session.weekday}</p>
          </div>
          <StatusBadge session={session} />
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-start gap-2">
            <dt className="sr-only">Time</dt>
            <Clock className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden="true" />
            <dd>
              <span className="font-medium tabular-nums">{timeRange(session)}</span>
              {duration && <span className="text-neutral-600"> · {duration}</span>}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">Venue</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden="true" />
            <dd>
              {session.venue}
              {session.room && <span className="text-neutral-600"> · Room {session.room}</span>}
            </dd>
          </div>
        </dl>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Slots", value: `${slots.length}/${session.capacity}`, tone: "text-neutral-900" },
            { label: "Present", value: session.present, tone: "text-green-700" },
            { label: "Absent", value: session.absent, tone: session.absent ? "text-red-700" : "text-neutral-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-neutral-200 bg-white px-2 py-1.5">
              <p className={`text-base leading-tight font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
              <p className="text-[11px] text-neutral-600">{stat.label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col p-3">
        {canWrite && open > 0 && !locked && (
          <button
            type="button"
            disabled={isPending || waiting === 0}
            onClick={() => run(() => fillSessionSlots(session.session_id))}
            className={`${outlineButton} mb-3 self-start`}
            title={waiting === 0 ? "No unscheduled applicants are in the For Examination stage." : undefined}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Fill {toFill} slot{toFill === 1 ? "" : "s"} ({waiting} waiting)
          </button>
        )}

        {slots.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-600">No applicants in this session yet.</p>
        ) : (
          <ul className="scrollbar-none max-h-[50vh] space-y-1 overflow-y-auto pr-1 text-sm">
            {slots.map((slot) => {
              const checked = present[slot.application_id];
              // Attendance is only finalized once the session has ended; until then
              // the status stays blank even when the checkbox is ticked.
              let status: string | null = null;
              if (session.finished) status = touched || slot.attendance ? (checked ? "Present" : "Absent") : "Not marked";
              let badge = "border-neutral-400 bg-neutral-100 text-neutral-700";
              if (status === "Present") badge = "border-green-600 bg-green-100 text-green-900";
              if (status === "Absent") badge = "border-red-400 bg-red-100 text-red-900";
              // A scored applicant stays present and stays in the session.
              const scoredLock = slot.scored && slot.attendance === "PRESENT";
              return (
                <li key={slot.application_id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[#f4f5fd]">
                  <input
                    type="checkbox"
                    id={`slot-${slot.application_id}`}
                    checked={checked}
                    disabled={!canWrite || locked || scoredLock}
                    title={scoredLock ? "Has an exam score, so attendance stays Present" : undefined}
                    onChange={(e) => {
                      setTouched(true);
                      setPresent((prev) => ({ ...prev, [slot.application_id]: e.target.checked }));
                    }}
                    className="h-4 w-4 accent-[#191e73]"
                  />
                  <label htmlFor={`slot-${slot.application_id}`} className="min-w-0 flex-1" title={slot.application_no}>
                    <span className="block truncate">{slot.name}</span>
                    <span className="block text-[11px] text-neutral-500 tabular-nums">{slot.application_no}</span>
                  </label>
                  {slot.scored && (
                    <span className="rounded-full border border-[#191e73]/30 bg-[#e3e4f8] px-2 text-[11px] text-[#191e73]" title="Has an exam score">
                      Scored
                    </span>
                  )}
                  {status && <span className={`rounded-full border px-2 text-[11px] ${badge}`}>{status}</span>}
                  {canWrite && !locked && !slot.scored && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${slot.name} from this session?`)) {
                          run(() => removeFromSession(session.session_id, slot.application_id));
                        }
                      }}
                      className="rounded p-0.5 text-neutral-500 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${slot.name} from this session`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-auto space-y-2 pt-4">
          <FeedbackLine feedback={feedback} />
          {session.archived ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-800">
              <Archive className="size-3.5" aria-hidden="true" />
              This session is archived and read-only. Restore it from the Archived tab to make changes.
            </p>
          ) : (
            session.finished &&
            slots.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                <Lock className="size-3.5" aria-hidden="true" />
                This session has ended; attendance is locked.
              </p>
            )
          )}
          {canWrite && slots.length > 0 && !locked && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setTouched(true);
                  setPresent(Object.fromEntries(slots.map((s) => [s.application_id, true])));
                }}
                className={outlineButton}
              >
                Mark all present
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    saveAttendance(
                      session.session_id,
                      slots.map((s) => ({ application_id: s.application_id, present: present[s.application_id] })),
                    ),
                  )
                }
                className={primaryButton}
              >
                {isPending ? "Saving…" : "Save attendance"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sessions table
// ---------------------------------------------------------------------------

function SessionsTable({
  sessions,
  selected,
  canWrite,
  isPending,
  emptyText,
  onSelect,
  onArchive,
  onRestore,
}: Readonly<{
  sessions: SessionRow[];
  selected: SessionRow | null;
  canWrite: boolean;
  isPending: boolean;
  emptyText: string;
  onSelect: (id: number) => void;
  onArchive: (session: SessionRow) => void;
  onRestore: (session: SessionRow) => void;
}>) {
  const columns = canWrite ? 8 : 7;

  return (
    <div className={tableStyles.wrap}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={tableStyles.headRow}>
            <th className={tableStyles.th}>Date</th>
            <th className={tableStyles.th}>Time</th>
            <th className={tableStyles.th}>Venue</th>
            <th className={`${tableStyles.th} w-32`}>Slots</th>
            <th className={`${tableStyles.th} text-center`}>Present</th>
            <th className={`${tableStyles.th} text-center`}>Absent</th>
            <th className={tableStyles.th}>Status</th>
            {canWrite && (
              <th className={`${tableStyles.th} w-12`}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className={tableStyles.body}>
          {sessions.length === 0 && (
            <tr>
              <td colSpan={columns} className={tableStyles.empty}>
                {emptyText}
              </td>
            </tr>
          )}
          {sessions.map((session) => {
            const active = selected?.session_id === session.session_id;
            const full = session.capacity > 0 && session.registered >= session.capacity;
            const fill = session.capacity > 0 ? Math.min(100, (session.registered / session.capacity) * 100) : 0;
            const duration = formatDuration(session.duration_minutes);
            return (
              <tr
                key={session.session_id}
                onClick={() => onSelect(session.session_id)}
                className={`cursor-pointer transition-colors ${
                  active ? "bg-[#eef0fd] shadow-[inset_3px_0_0_#191e73]" : "hover:bg-[#f4f5fd]"
                }`}
              >
                <td className={`${tableStyles.td} whitespace-nowrap`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(session.session_id);
                    }}
                    aria-current={active ? "true" : undefined}
                    className="text-left underline-offset-2 hover:underline"
                  >
                    <span className={`block font-medium ${active ? "text-[#191e73]" : "text-neutral-900"}`}>
                      {session.date}
                    </span>
                    <span className="block text-xs text-neutral-600">{session.weekday}</span>
                  </button>
                </td>
                <td className={`${tableStyles.td} whitespace-nowrap`}>
                  <span className="block tabular-nums text-neutral-900">{timeRange(session)}</span>
                  {duration && <span className="block text-xs text-neutral-600">{duration}</span>}
                </td>
                <td className={tableStyles.td}>
                  <span className="block text-neutral-900">{session.venue}</span>
                  {session.room && <span className="block text-xs text-neutral-600">Room {session.room}</span>}
                </td>
                <td className={tableStyles.td}>
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="tabular-nums">
                      <span className="text-sm font-semibold text-neutral-900">{session.registered}</span>
                      <span className="text-neutral-500"> / {session.capacity}</span>
                    </span>
                    {full && <span className="font-medium text-amber-700">Full</span>}
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                    <span
                      className={`block h-full rounded-full ${full ? "bg-amber-500" : "bg-[#191e73]/70"}`}
                      style={{ width: `${fill}%` }}
                    />
                  </span>
                </td>
                <td className={`${tableStyles.td} text-center font-medium text-green-700 tabular-nums`}>
                  {session.present}
                </td>
                <td className={`${tableStyles.td} text-center`}>
                  {session.absent > 0 ? (
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 tabular-nums">
                      {session.absent}
                    </span>
                  ) : (
                    <span className="text-neutral-400 tabular-nums">0</span>
                  )}
                </td>
                <td className={tableStyles.td}>
                  <StatusBadge session={session} />
                </td>
                {canWrite && (
                  <td className={`${tableStyles.td} text-center`}>
                    {session.archived ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(session);
                        }}
                        title="Restore session"
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-400 bg-white px-2 py-1 text-xs font-medium whitespace-nowrap hover:bg-neutral-100"
                        aria-label={`Restore the ${session.date} session at ${session.venue}`}
                      >
                        <ArchiveRestore className="size-3.5" aria-hidden="true" />
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(session);
                        }}
                        title="Archive session"
                        className="rounded p-1 text-neutral-500 hover:bg-amber-50 hover:text-amber-800"
                        aria-label={`Archive the ${session.date} session at ${session.venue}`}
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ExamSchedule({
  cycleId,
  sessions,
  selected,
  slots,
  waiting,
  canWrite,
  yearFilter,
}: Readonly<{
  cycleId: number;
  sessions: SessionRow[];
  selected: SessionRow | null;
  slots: SlotRow[];
  waiting: number;
  canWrite: boolean;
  /** School year dropdown, shown in the sessions header. */
  yearFilter?: ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [panelFeedback, setPanelFeedback] = useState<Feedback>(null);

  const active = sessions.filter((s) => !s.archived);
  const upcoming = active.filter((s) => !s.finished);
  const finished = active.filter((s) => s.finished);
  const archived = sessions.filter((s) => s.archived);
  // Open on the tab of the selected session (or wherever there are sessions).
  const [tab, setTab] = useState<Tab>(() => {
    if (selected?.archived) return "archived";
    if (selected?.finished || (upcoming.length === 0 && finished.length > 0)) return "finished";
    return "upcoming";
  });

  const upcomingSlots = upcoming.reduce((sum, s) => sum + s.registered, 0);
  const upcomingCapacity = upcoming.reduce((sum, s) => sum + s.capacity, 0);
  const nextSession = upcoming[0];

  function select(sessionId: number) {
    setPanelFeedback(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", String(sessionId));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function runSessionAction(action: () => Promise<ActionResult>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      toast.fromResult(result);
      setFeedback("error" in result ? { type: "error", text: result.error } : null);
      router.refresh();
    });
  }

  function archive(session: SessionRow) {
    const note =
      !session.finished && session.registered
        ? " Applicants without an exam score will get their slot back and return to the waiting list."
        : " Its slots and attendance are kept.";
    if (!window.confirm(`Archive the ${session.date} session at ${session.venue}?${note} You can restore it later.`)) return;
    runSessionAction(() => archiveExamSession(session.session_id));
  }

  function restore(session: SessionRow) {
    runSessionAction(() => restoreExamSession(session.session_id));
  }

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "finished", label: "Finished", count: finished.length },
    { value: "archived", label: "Archived", count: archived.length },
  ];
  const listed = { upcoming, finished, archived }[tab];
  const emptyText = {
    upcoming: sessions.length === 0 ? "No exam sessions for this school year yet." : "No upcoming sessions.",
    finished: "No finished sessions yet.",
    archived: "No archived sessions.",
  }[tab];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CalendarClock}
          label="Upcoming sessions"
          value={upcoming.length}
          note={nextSession ? `Next: ${nextSession.date}, ${nextSession.time ?? ""}`.replace(/, $/, "") : "None scheduled"}
        />
        <StatCard icon={CalendarCheck} label="Finished sessions" value={finished.length} tone="muted" />
        <StatCard
          icon={Users}
          label="Upcoming slots taken"
          value={`${upcomingSlots}/${upcomingCapacity}`}
          note={upcomingCapacity ? `${upcomingCapacity - upcomingSlots} open` : null}
          tone="info"
        />
        <StatCard
          icon={UserPlus}
          label="Waiting for a session"
          value={waiting}
          note="For Examination, not seated"
          tone={waiting > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-neutral-500 bg-white/95 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <CalendarDays className="size-4 text-[#191e73]" aria-hidden="true" />
                Exam sessions
              </h2>
              {yearFilter}
            </div>
            {canWrite && (
              <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New session
              </button>
            )}
          </div>

          <div className="mb-3 inline-flex rounded-full border border-neutral-400 bg-neutral-100 p-0.5" role="tablist" aria-label="Sessions">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={`rounded-full px-4 py-1 text-sm transition-colors ${
                  tab === t.value ? "bg-[#191e73] font-semibold text-white shadow-sm" : "text-neutral-700 hover:text-black"
                }`}
              >
                {t.label} <span className="tabular-nums opacity-80">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="mb-2">
            <FeedbackLine feedback={feedback} />
          </div>

          <SessionsTable
            sessions={listed}
            selected={selected}
            canWrite={canWrite}
            isPending={isPending}
            emptyText={emptyText}
            onSelect={select}
            onArchive={archive}
            onRestore={restore}
          />

          <p className="mt-2 text-xs text-neutral-600">
            Click a session to manage its attendance. Sessions lock automatically after their end time. Seated
            applicants are emailed their exam schedule.
          </p>
        </section>

        {selected ? (
          <AttendancePanel
            key={`${selected.session_id}-${slots.map((s) => s.application_id).join(",")}`}
            session={selected}
            slots={slots}
            waiting={waiting}
            canWrite={canWrite}
            feedback={panelFeedback}
            setFeedback={setPanelFeedback}
          />
        ) : (
          <section className="rounded-xl border border-dashed border-neutral-400 bg-white/95 p-6 text-center text-sm text-neutral-600">
            <CalendarDays className="mx-auto mb-2 size-8 text-neutral-400" aria-hidden="true" />
            <h2 className="mb-1 font-semibold text-black">Attendance</h2>
            Select a session to see its applicants.
          </section>
        )}
      </div>

      {canWrite && (
        <NewSessionModal
          open={adding}
          cycleId={cycleId}
          onClose={(sessionId) => {
            setAdding(false);
            if (sessionId) {
              setTab("upcoming");
              select(sessionId);
            }
          }}
        />
      )}
    </div>
  );
}
