import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { resolveCycle } from "@/features/admission/admission-stats";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { getCycleExam } from "@/features/admission/exam";
import { BASE_SET, toExamSet } from "@/features/admission/exam-scoring";
import {
  answerSheetQrPayload,
  renderAnswerSheets,
  type AnswerSheetData,
} from "@/features/admission/answer-sheet-pdf";
import { hasAnyPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fullName(a: { last_name: string; first_name: string; middle_name: string | null }): string {
  return `${a.last_name}, ${a.first_name}${a.middle_name ? ` ${a.middle_name}` : ""}`;
}

/** Printable, scannable answer sheets (one page per applicant) for a cycle's exam. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasAnyPermission(session.user.role, ["admission"], "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { cycle } = await resolveCycle(request.nextUrl.searchParams.get("cycle") ?? undefined);
  if (!cycle) return new Response("No admission cycle exists yet.", { status: 404 });

  const exam = await getCycleExam(cycle.cycle_id);
  if (!exam) return new Response("Create the exam for this school year first.", { status: 400 });

  // Every set has the same items; only the answer key differs.
  const questionCount = await prisma.tbl_exam_question.count({ where: { exam_id: exam.exam_id, set_label: BASE_SET } });
  if (questionCount === 0) return new Response("Add questions before printing answer sheets.", { status: 400 });

  // Optional ?sessions=1,2,3 narrows the print to those exam sessions.
  const sessionIds = (request.nextUrl.searchParams.get("sessions") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  // Only applicants assigned to a session of this exam (one seat per application).
  const applications = await prisma.tbl_application.findMany({
    where: {
      cycle_id: cycle.cycle_id,
      ...ACTIVE_APPLICATION,
      tbl_exam_session_applicant: {
        is: {
          tbl_exam_session: { exam_id: exam.exam_id, archived_at: null },
          ...(sessionIds.length > 0 ? { session_id: { in: sessionIds } } : {}),
        },
      },
    },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: { select: { last_name: true, first_name: true, middle_name: true } },
      tbl_exam_session_applicant: { select: { tbl_exam_session: { select: { room: true, exam_set: true } } } },
    },
  });
  if (applications.length === 0) {
    return new Response("No applicants are assigned to an exam session yet. Assign them on the Exam Schedule page first.", { status: 400 });
  }

  // Group the batch by room, then by surname, so sheets print room-by-room.
  const roomOf = (a: (typeof applications)[number]) => a.tbl_exam_session_applicant?.tbl_exam_session?.room ?? "";
  applications.sort((a, b) => {
    const room = roomOf(a).localeCompare(roomOf(b));
    if (room !== 0) return room;
    return (a.tbl_applicant?.last_name ?? "").localeCompare(b.tbl_applicant?.last_name ?? "");
  });

  const data: AnswerSheetData = {
    examName: exam.exam_name,
    examDate: exam.exam_date ? dateFormat.format(exam.exam_date) : null,
    schoolYear: cycle.school_year,
    questionCount,
    applicants: applications.map((a) => ({
      application_id: a.application_id,
      application_no: a.application_no,
      full_name: a.tbl_applicant ? fullName(a.tbl_applicant) : a.application_no,
      room: a.tbl_exam_session_applicant?.tbl_exam_session?.room ?? null,
      set: toExamSet(a.tbl_exam_session_applicant?.tbl_exam_session?.exam_set),
      qr: answerSheetQrPayload(a.application_no, exam.exam_id),
    })),
  };

  const pdf = await renderAnswerSheets(data);
  const filename = `answer-sheets-${cycle.school_year.replace(/\s+/g, "")}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
