import { Suspense } from "react";
import { connection } from "next/server";

import { ExamSchedule, type SeatRow, type SessionRow } from "@/components/admission/exam-schedule";
import { FilterSelect } from "@/components/admission/filter-select";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { resolveCycle } from "@/features/admission/admission-stats";
import { formatFullName } from "@/features/admission/enrollment-queries";
import { ATTENDANCE } from "@/features/admission/exam-scoring";
import { ADMISSION_STAGES } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type PageProps = Readonly<{
  searchParams: Promise<{ cycle?: string | string[]; session?: string | string[] }>;
}>;

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function formatTime(value: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

async function ScheduleContent({ searchParams }: PageProps) {
  await connection();
  const user = await requirePermission("admission", "read");
  const canWrite = await hasPermission(user.role, "admission", "write");

  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);

  if (!cycle) {
    return (
      <div className="p-4">
        <h1 className="sr-only">Exam schedule</h1>
        <p className="rounded-md border border-neutral-500 bg-white/90 p-6 text-center text-sm text-neutral-600">
          No admission cycle exists yet.
        </p>
      </div>
    );
  }

  const [sessions, attendance, waiting] = await Promise.all([
    prisma.tbl_exam_session.findMany({
      where: { tbl_exam: { cycle_id: cycle.cycle_id } },
      orderBy: [{ session_date: "asc" }, { start_time: "asc" }, { session_id: "asc" }],
      select: {
        session_id: true,
        session_date: true,
        start_time: true,
        venue: true,
        room: true,
        capacity: true,
        _count: { select: { tbl_exam_session_applicant: true } },
      },
    }),
    prisma.tbl_exam_session_applicant.groupBy({
      by: ["session_id", "attendance"],
      where: { tbl_exam_session: { tbl_exam: { cycle_id: cycle.cycle_id } } },
      _count: { _all: true },
    }),
    prisma.tbl_application.count({
      where: {
        cycle_id: cycle.cycle_id,
        tbl_admission_stage: { stage_name: ADMISSION_STAGES.FOR_EXAMINATION },
        tbl_exam_session_applicant: { is: null },
      },
    }),
  ]);

  const countOf = (sessionId: number, status: string) =>
    attendance.find((a) => a.session_id === sessionId && a.attendance === status)?._count._all ?? 0;

  const rows: SessionRow[] = sessions.map((s) => ({
    session_id: s.session_id,
    date: dateFormat.format(s.session_date),
    time: formatTime(s.start_time),
    venue: s.venue,
    room: s.room,
    capacity: s.capacity,
    registered: s._count.tbl_exam_session_applicant,
    present: countOf(s.session_id, ATTENDANCE.PRESENT),
    absent: countOf(s.session_id, ATTENDANCE.ABSENT),
  }));

  const requested = Number(Array.isArray(params.session) ? params.session[0] : params.session);
  const selected = rows.find((r) => r.session_id === requested) ?? rows[0] ?? null;

  const seats: SeatRow[] = selected
    ? (
        await prisma.tbl_exam_session_applicant.findMany({
          where: { session_id: selected.session_id },
          select: {
            application_id: true,
            attendance: true,
            tbl_application: {
              select: {
                application_no: true,
                tbl_applicant: { select: { first_name: true, middle_name: true, last_name: true, suffix: true } },
              },
            },
          },
        })
      )
        .sort((a, b) => {
          const lastA = a.tbl_application.tbl_applicant?.last_name ?? "";
          const lastB = b.tbl_application.tbl_applicant?.last_name ?? "";
          return lastA.localeCompare(lastB) || a.application_id - b.application_id;
        })
        .map((seat) => ({
          application_id: seat.application_id,
          application_no: seat.tbl_application.application_no,
          name: formatFullName(seat.tbl_application.tbl_applicant),
          attendance:
            seat.attendance === ATTENDANCE.PRESENT || seat.attendance === ATTENDANCE.ABSENT ? seat.attendance : null,
        }))
    : [];

  return (
    <div className="relative isolate min-h-full p-3 sm:p-4">
      <QcuWatermark />
      <h1 className="sr-only">Exam schedule, school year {cycle.school_year}</h1>

      <ExamSchedule
        cycleId={cycle.cycle_id}
        sessions={rows}
        selected={selected}
        seats={seats}
        waiting={waiting}
        canWrite={canWrite}
        yearFilter={
          <FilterSelect
            param="cycle"
            label="School year"
            value={String(cycle.cycle_id)}
            options={cycles.map((c) => ({ value: String(c.cycle_id), label: `S.Y. ${c.school_year}` }))}
          />
        }
      />
    </div>
  );
}

export default function ExamSchedulePage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={null}>
      <ScheduleContent searchParams={searchParams} />
    </Suspense>
  );
}
