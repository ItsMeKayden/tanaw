"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, UserPlus, X } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
import {
  createExamSession,
  deleteExamSession,
  fillSessionSeats,
  removeFromSession,
  saveAttendance,
} from "@/features/admission/actions/exam-schedule";
import { examSessionSchema, type ExamSessionValues } from "@/features/admission/schemas";

export type SessionRow = {
  session_id: number;
  date: string;
  time: string | null;
  venue: string;
  room: string | null;
  capacity: number;
  registered: number;
  present: number;
  absent: number;
};

export type SeatRow = {
  application_id: number;
  application_no: string;
  name: string;
  attendance: "PRESENT" | "ABSENT" | null;
};

type Feedback = { type: "success" | "error"; text: string } | null;
type ActionResult = { error: string } | { success: true; message: string };

const cell = "border border-neutral-500 px-2 py-1.5 text-center";
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

const EMPTY_SESSION: ExamSessionValues = { session_date: "", start_time: "", venue: "", room: "", capacity: "" };
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
      className="mb-3 grid gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-5"
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
      {field("venue", "Venue", { placeholder: "e.g. Main Campus, Bldg A", maxLength: 150 })}
      {field("room", "Room (optional)", { placeholder: "e.g. 204", maxLength: 50 })}
      {field("capacity", "Capacity", { type: "number", min: 1, max: 1000, inputMode: "numeric", placeholder: "e.g. 40" })}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
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
  return `${session.date}${session.time ? `, ${session.time}` : ""} · ${session.venue}${session.room ? `, Room ${session.room}` : ""}`;
}

function AttendancePanel({
  session,
  seats,
  waiting,
  canWrite,
  feedback,
  setFeedback,
}: Readonly<{
  session: SessionRow;
  seats: SeatRow[];
  waiting: number;
  canWrite: boolean;
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [present, setPresent] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(seats.map((s) => [s.application_id, s.attendance === "PRESENT"])),
  );
  const [touched, setTouched] = useState(false);

  const run = (action: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback("error" in result ? { type: "error", text: result.error } : { type: "success", text: result.message });
      if (!("error" in result)) {
        setTouched(false);
        router.refresh();
      }
    });
  };

  const open = session.capacity - seats.length;
  const toFill = Math.min(open, waiting);

  return (
    <section className="flex flex-col rounded-md border border-neutral-500 bg-white/95 p-3">
      <h2 className="font-semibold">Attendance: {sessionTitle(session)}</h2>
      <p className="mb-3 text-xs text-neutral-600 tabular-nums">
        {seats.length} of {session.capacity} seats taken
      </p>

      {canWrite && open > 0 && (
        <button
          type="button"
          disabled={isPending || waiting === 0}
          onClick={() => run(() => fillSessionSeats(session.session_id))}
          className={`${outlineButton} mb-3 self-start`}
          title={waiting === 0 ? "No unscheduled applicants are in the For Examination stage." : undefined}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Fill {toFill} seat{toFill === 1 ? "" : "s"} ({waiting} waiting)
        </button>
      )}

      {seats.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-600">No applicants in this session yet.</p>
      ) : (
        <ul className="scrollbar-none max-h-[50vh] space-y-1 overflow-y-auto pr-1 text-sm">
          {seats.map((seat) => {
            const checked = present[seat.application_id];
            let status = "Not marked";
            if (touched || seat.attendance) status = checked ? "Present" : "Absent";
            let badge = "border-neutral-400 bg-neutral-100 text-neutral-700";
            if (status === "Present") badge = "border-green-600 bg-green-100 text-green-900";
            if (status === "Absent") badge = "border-red-400 bg-red-100 text-red-900";
            return (
              <li key={seat.application_id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[#e3e4f8]/60">
                <input
                  type="checkbox"
                  id={`seat-${seat.application_id}`}
                  checked={checked}
                  disabled={!canWrite}
                  onChange={(e) => {
                    setTouched(true);
                    setPresent((prev) => ({ ...prev, [seat.application_id]: e.target.checked }));
                  }}
                  className="h-4 w-4 accent-[#191e73]"
                />
                <label htmlFor={`seat-${seat.application_id}`} className="min-w-0 flex-1 truncate" title={seat.application_no}>
                  {seat.name}
                </label>
                <span className={`rounded-full border px-2 text-[11px] ${badge}`}>{status}</span>
                {canWrite && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (window.confirm(`Remove ${seat.name} from this session?`)) {
                        run(() => removeFromSession(session.session_id, seat.application_id));
                      }
                    }}
                    className="rounded p-0.5 text-neutral-500 hover:bg-red-50 hover:text-red-700"
                    aria-label={`Remove ${seat.name} from this session`}
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
        {canWrite && seats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setTouched(true);
                setPresent(Object.fromEntries(seats.map((s) => [s.application_id, true])));
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
                    seats.map((s) => ({ application_id: s.application_id, present: present[s.application_id] })),
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

export function ExamSchedule({
  cycleId,
  sessions,
  selected,
  seats,
  waiting,
  canWrite,
  yearFilter,
}: Readonly<{
  cycleId: number;
  sessions: SessionRow[];
  selected: SessionRow | null;
  seats: SeatRow[];
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

  function select(sessionId: number) {
    setPanelFeedback(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", String(sessionId));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function remove(session: SessionRow) {
    const seatsNote = session.registered ? ` Its ${session.registered} seat(s) and attendance will be removed.` : "";
    if (!window.confirm(`Delete the ${session.date} session at ${session.venue}?${seatsNote}`)) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await deleteExamSession(session.session_id);
      setFeedback("error" in result ? { type: "error", text: result.error } : { type: "success", text: result.message });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
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

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#c5c8f0]">
                {["Date", "Venue", "Cap.", "Reg.", "Present", "Absent"].map((h) => (
                  <th key={h} className={`${cell} font-medium`}>
                    {h}
                  </th>
                ))}
                {canWrite && (
                  <th className={`${cell} w-10 font-medium`}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className={`${cell} py-8 text-neutral-600`}>
                    No exam sessions for this school year yet.
                  </td>
                </tr>
              )}
              {sessions.map((session) => {
                const active = selected?.session_id === session.session_id;
                return (
                  <tr
                    key={session.session_id}
                    onClick={() => select(session.session_id)}
                    className={`cursor-pointer ${active ? "bg-[#e3e4f8]" : "hover:bg-[#e3e4f8]/50"}`}
                  >
                    <td className={cell}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          select(session.session_id);
                        }}
                        aria-current={active ? "true" : undefined}
                        className="text-left underline-offset-2 hover:underline"
                      >
                        {session.date}
                        {session.time && <span className="block text-xs text-neutral-600">{session.time}</span>}
                      </button>
                    </td>
                    <td className={`${cell} text-left`}>
                      {session.venue}
                      {session.room && <span className="block text-xs text-neutral-600">Room {session.room}</span>}
                    </td>
                    <td className={`${cell} tabular-nums`}>{session.capacity}</td>
                    <td className={`${cell} tabular-nums`}>{session.registered}</td>
                    <td className={`${cell} tabular-nums`}>{session.present}</td>
                    <td className={`${cell} bg-red-50 tabular-nums`}>{session.absent}</td>
                    {canWrite && (
                      <td className={cell}>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(session);
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
        {canWrite && (
          <p className="mt-2 text-xs text-neutral-600">
            {waiting} applicant{waiting === 1 ? " is" : "s are"} in the For Examination stage without a session.
          </p>
        )}
      </section>

      {selected ? (
        <AttendancePanel
          key={`${selected.session_id}-${seats.map((s) => s.application_id).join(",")}`}
          session={selected}
          seats={seats}
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
