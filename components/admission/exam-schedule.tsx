"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, X } from "lucide-react";

import { tableStyles } from "@/components/ui/table-styles";
import { DatePicker } from "@/components/ui/date-picker";
import {
  createExamSession,
  deleteExamSession,
  fillSessionSlots,
  removeFromSession,
  saveAttendance,
} from "@/features/admission/actions/exam-schedule";
import { examSessionSchema, type ExamSessionValues } from "@/features/admission/schemas";
import { toast } from "@/components/ui/toaster";

export type SessionRow = {
  session_id: number;
  date: string;
  time: string | null;
  end_time: string | null;
  venue: string;
  room: string | null;
  capacity: number;
  registered: number;
  present: number;
  absent: number;
  finished: boolean;
};

export type SlotRow = {
  application_id: number;
  application_no: string;
  name: string;
  attendance: "PRESENT" | "ABSENT" | null;
};

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { error: string } | { success: true; message: string };

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

const EMPTY_SESSION: ExamSessionValues = { session_date: "", start_time: "", end_time: "", venue: "", room: "", capacity: "" };
const todayIso = () => new Date().toISOString().slice(0, 10);

function NewSessionForm({
  cycleId,
  onDone,
}: Readonly<{ cycleId: number; onDone: (sessionId?: number) => void }>) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<ExamSessionValues>({
    resolver: zodResolver(examSessionSchema),
    defaultValues: EMPTY_SESSION,
    mode: "onTouched",
  });

  const submit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await createExamSession(cycleId, values);
      if ("error" in result) setError(result.error);
      else onDone(result.sessionId);
    });
  });

  const border = (name: keyof ExamSessionValues) => (errors[name] ? "border-red-500" : "border-neutral-400");

  const field = (name: keyof ExamSessionValues, label: string, props: ComponentProps<"input">) => (
    <label className="flex flex-col gap-1 text-xs text-neutral-800">
      {label}
      <input {...props} {...register(name)} aria-invalid={Boolean(errors[name])} className={`${fieldClass} ${border(name)}`} />
      {errors[name] && <span className="text-red-600">{errors[name]?.message}</span>}
    </label>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mb-3 grid gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="flex flex-col gap-1 text-xs text-neutral-800">
        <label htmlFor="session-date">Date</label>
        <Controller
          control={control}
          name="session_date"
          render={({ field: { value, onChange } }) => (
            <DatePicker
              id="session-date"
              value={value}
              onChange={onChange}
              onClose={() => void trigger("session_date")}
              min={todayIso()}
              placeholder="Select exam date"
              invalid={Boolean(errors.session_date)}
              className={`${fieldClass} ${border("session_date")}`}
            />
          )}
        />
        {errors.session_date && <span className="text-red-600">{errors.session_date.message}</span>}
      </div>
      {field("start_time", "Start time (optional)", { type: "time" })}
      {field("end_time", "End time (optional)", { type: "time" })}
      {field("venue", "Venue", { placeholder: "e.g. Main Campus, Bldg A", maxLength: 150 })}
      {field("room", "Room (optional)", { placeholder: "e.g. 204", maxLength: 50 })}
      {field("capacity", "Capacity", { type: "number", min: 1, max: 1000, inputMode: "numeric", placeholder: "e.g. 40" })}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
        <button type="submit" disabled={isPending} className={primaryButton}>
          {isPending ? "Adding…" : "Add session"}
        </button>
        <button type="button" onClick={() => onDone()} className={outlineButton}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-xs text-red-700">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function sessionTitle(session: SessionRow) {
  const time = session.time
    ? session.end_time
      ? `${session.time} – ${session.end_time}`
      : session.time
    : null;
  return `${session.date}${time ? `, ${time}` : ""} · ${session.venue}${session.room ? `, Room ${session.room}` : ""}`;
}

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

  return (
    <section className="flex flex-col rounded-md border border-neutral-500 bg-white/95 p-3">
      <h2 className="font-semibold">Attendance: {sessionTitle(session)}</h2>
      <p className="mb-3 text-xs text-neutral-600 tabular-nums">
        {slots.length} of {session.capacity} slots taken
      </p>

      {canWrite && open > 0 && !session.finished && (
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
            return (
              <li key={slot.application_id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[#f4f5fd]">
                <input
                  type="checkbox"
                  id={`slot-${slot.application_id}`}
                  checked={checked}
                  disabled={!canWrite || session.finished}
                  onChange={(e) => {
                    setTouched(true);
                    setPresent((prev) => ({ ...prev, [slot.application_id]: e.target.checked }));
                  }}
                  className="h-4 w-4 accent-[#191e73]"
                />
                <label htmlFor={`slot-${slot.application_id}`} className="min-w-0 flex-1 truncate" title={slot.application_no}>
                  {slot.name}
                </label>
                {status && <span className={`rounded-full border px-2 text-[11px] ${badge}`}>{status}</span>}
                {canWrite && !session.finished && (
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
        {session.finished && slots.length > 0 && (
          <p className="text-xs text-neutral-500">This session has ended; attendance is locked.</p>
        )}
        {canWrite && slots.length > 0 && !session.finished && (
          <div className="flex flex-wrap gap-2">
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
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SessionsTable({
  sessions,
  selected,
  canWrite,
  isPending,
  onSelect,
  onRemove,
}: Readonly<{
  sessions: SessionRow[];
  selected: SessionRow | null;
  canWrite: boolean;
  isPending: boolean;
  onSelect: (id: number) => void;
  onRemove: (session: SessionRow) => void;
}>) {
  if (sessions.length === 0) return null;

  return (
    <div className={tableStyles.wrap}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={tableStyles.headRow}>
            <th className={tableStyles.th}>Date</th>
            <th className={tableStyles.th}>Venue</th>
            <th className={`${tableStyles.th} w-36`}>Slots</th>
            <th className={`${tableStyles.th} text-center`}>Present</th>
            <th className={`${tableStyles.th} text-center`}>Absent</th>
            {canWrite && (
              <th className={`${tableStyles.th} w-12`}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className={tableStyles.body}>
          {sessions.map((session) => {
            const active = selected?.session_id === session.session_id;
            const full = session.capacity > 0 && session.registered >= session.capacity;
            const fill = session.capacity > 0 ? Math.min(100, (session.registered / session.capacity) * 100) : 0;
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
                    {session.time && (
                      <span className="block text-xs text-neutral-600">
                        {session.time}{session.end_time ? ` – ${session.end_time}` : ""}
                      </span>
                    )}
                  </button>
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
                {canWrite && (
                  <td className={`${tableStyles.td} text-center`}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(session);
                      }}
                      className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete the ${session.date} session at ${session.venue}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
  const [showFinished, setShowFinished] = useState(false);

  const upcoming = sessions.filter((s) => !s.finished);
  const finished = sessions.filter((s) => s.finished);

  function select(sessionId: number) {
    setPanelFeedback(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", String(sessionId));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function remove(session: SessionRow) {
    const slotsNote = session.registered ? ` Its ${session.registered} slot(s) and attendance will be removed.` : "";
    if (!window.confirm(`Delete the ${session.date} session at ${session.venue}?${slotsNote}`)) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await deleteExamSession(session.session_id);
      toast.fromResult(result);
      setFeedback("error" in result ? { type: "error", text: result.error } : null);
      router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[1fr_340px]">
      <section className="rounded-md border border-neutral-500 bg-white/95 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Exam sessions</h2>
            {yearFilter}
          </div>
          {canWrite && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New session
            </button>
          )}
        </div>

        {adding && (
          <NewSessionForm
            cycleId={cycleId}
            onDone={(sessionId) => {
              setAdding(false);
              if (sessionId) select(sessionId);
            }}
          />
        )}

        <div className="mb-2">
          <FeedbackLine feedback={feedback} />
        </div>

        {upcoming.length === 0 && finished.length === 0 && (
          <div className={tableStyles.wrap}>
            <table className="w-full border-collapse text-sm">
              <tbody className={tableStyles.body}>
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className={tableStyles.empty}>
                    No exam sessions for this school year yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {upcoming.length > 0 && (
          <SessionsTable
            sessions={upcoming}
            selected={selected}
            canWrite={canWrite}
            isPending={isPending}
            onSelect={select}
            onRemove={remove}
          />
        )}

        {finished.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowFinished((v) => !v)}
              className="mb-2 flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              {showFinished ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Finished sessions ({finished.length})
            </button>
            {showFinished && (
              <SessionsTable
                sessions={finished}
                selected={selected}
                canWrite={canWrite}
                isPending={isPending}
                onSelect={select}
                onRemove={remove}
              />
            )}
          </div>
        )}

        {canWrite && (
          <p className="mt-2 text-xs text-neutral-600">
            {waiting} applicant{waiting === 1 ? " is" : "s are"} in the For Examination stage without a session.
          </p>
        )}
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
        <section className="rounded-md border border-neutral-500 bg-white/95 p-3 text-sm text-neutral-600">
          <h2 className="mb-2 font-semibold text-black">Attendance</h2>
          Select a session to see its applicants.
        </section>
      )}
    </div>
  );
}
