"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { getAccountId, requireAnyPermission } from "@/lib/authorization";
import { EXAM_SCHEDULE_MODULES, EXAM_SCHEDULE_PATHS } from "@/features/admission/access";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ensureCycleExam } from "@/features/admission/exam";
import { ATTENDANCE } from "@/features/admission/exam-scoring";
import { examSessionSchema, type ExamSessionValues } from "@/features/admission/schemas";
import { ADMISSION_STAGES } from "@/features/admission/stages";

type ActionResult = { success: true; message: string; sessionId?: number } | { error: string };
type Db = Prisma.TransactionClient;

function validId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  for (const path of EXAM_SCHEDULE_PATHS) revalidatePath(path);
  revalidatePath("/admission/exam/scores");
}

function failure(label: string, error: unknown): ActionResult {
  console.error(`${label} error:`, error);
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

async function stageIds(db: Db) {
  const stages = await db.tbl_admission_stage.findMany({ select: { stage_id: true, stage_name: true } });
  const id = (name: string) => stages.find((s) => s.stage_name === name)?.stage_id ?? null;
  return {
    forExamination: id(ADMISSION_STAGES.FOR_EXAMINATION),
    examCompleted: id(ADMISSION_STAGES.EXAM_COMPLETED),
  };
}

export async function createExamSession(cycleIdInput: number, input: ExamSessionValues): Promise<ActionResult> {
  const user = await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const cycleId = validId(cycleIdInput);
  if (!cycleId) return { error: "Invalid admission cycle." };

  const parsed = examSessionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  try {
    const accountId = getAccountId(user);
    const session = await prisma.$transaction(async (tx) => {
      const exam = await ensureCycleExam(tx, cycleId);
      return tx.tbl_exam_session.create({
        data: {
          exam_id: exam.exam_id,
          session_date: new Date(`${data.session_date}T00:00:00.000Z`),
          start_time: data.start_time || null,
          venue: data.venue,
          room: data.room || null,
          capacity: Number(data.capacity),
          created_by: accountId,
        },
        select: { session_id: true },
      });
    });

    revalidate();
    return { success: true, message: "Exam session added.", sessionId: session.session_id };
  } catch (error) {
    return failure("Create exam session", error);
  }
}

export async function deleteExamSession(sessionIdInput: number): Promise<ActionResult> {
  await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };

  try {
    const deleted = await prisma.tbl_exam_session.deleteMany({ where: { session_id: sessionId } });
    if (deleted.count === 0) return { error: "Exam session not found." };
    revalidate();
    return { success: true, message: "Exam session deleted." };
  } catch (error) {
    return failure("Delete exam session", error);
  }
}

/**
 * Seats unscheduled applicants of the session's cycle who are in the
 * "For Examination" stage, earliest application first, up to capacity.
 */
export async function fillSessionSeats(sessionIdInput: number): Promise<ActionResult> {
  await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };

  try {
    const added = await prisma.$transaction(async (tx) => {
      const session = await tx.tbl_exam_session.findUnique({
        where: { session_id: sessionId },
        select: {
          capacity: true,
          tbl_exam: { select: { cycle_id: true } },
          _count: { select: { tbl_exam_session_applicant: { where: { tbl_application: ACTIVE_APPLICATION } } } },
        },
      });
      if (!session) throw new Error("Exam session not found.");

      const open = session.capacity - session._count.tbl_exam_session_applicant;
      if (open <= 0) throw new Error("This session is already full.");

      const { forExamination } = await stageIds(tx);
      if (!forExamination || !session.tbl_exam.cycle_id) return 0;

      const applicants = await tx.tbl_application.findMany({
        where: {
          ...ACTIVE_APPLICATION,
          cycle_id: session.tbl_exam.cycle_id,
          current_stage_id: forExamination,
          tbl_exam_session_applicant: { is: null },
        },
        orderBy: [{ application_date: "asc" }, { application_id: "asc" }],
        take: open,
        select: { application_id: true },
      });

      if (applicants.length > 0) {
        await tx.tbl_exam_session_applicant.createMany({
          data: applicants.map((a) => ({ session_id: sessionId, application_id: a.application_id })),
          skipDuplicates: true,
        });
      }
      return applicants.length;
    });

    revalidate();
    return added === 0
      ? { error: "No unscheduled applicants are waiting for the exam." }
      : { success: true, message: `${added} applicant${added === 1 ? "" : "s"} added to the session.` };
  } catch (error) {
    return failure("Fill exam session", error);
  }
}

export async function removeFromSession(sessionIdInput: number, applicationIdInput: number): Promise<ActionResult> {
  await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  const applicationId = validId(applicationIdInput);
  if (!sessionId || !applicationId) return { error: "Invalid applicant." };

  try {
    const deleted = await prisma.tbl_exam_session_applicant.deleteMany({
      where: { session_id: sessionId, application_id: applicationId },
    });
    if (deleted.count === 0) return { error: "Applicant is not in this session." };
    revalidate();
    return { success: true, message: "Applicant removed from the session." };
  } catch (error) {
    return failure("Remove from exam session", error);
  }
}

/**
 * Saves attendance for a session. Present applicants still "For Examination"
 * move to "Exam Completed"; an applicant changed to absent moves back if
 * they have no exam result yet. Stage changes are logged.
 */
export async function saveAttendance(
  sessionIdInput: number,
  entries: { application_id: number; present: boolean }[],
): Promise<ActionResult> {
  const user = await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };
  if (!Array.isArray(entries) || entries.length === 0) return { error: "No applicants to save." };
  if (entries.some((e) => !validId(e.application_id) || typeof e.present !== "boolean")) {
    return { error: "Invalid attendance data." };
  }

  try {
    const accountId = getAccountId(user);
    const now = new Date();

    const moved = await prisma.$transaction(async (tx) => {
      const seats = await tx.tbl_exam_session_applicant.findMany({
        where: { session_id: sessionId, application_id: { in: entries.map((e) => e.application_id) } },
        select: {
          application_id: true,
          tbl_application: {
            select: { current_stage_id: true, _count: { select: { tbl_exam_result: true } } },
          },
        },
      });
      if (seats.length !== entries.length) throw new Error("The applicant list changed. Reload the page.");

      const { forExamination, examCompleted } = await stageIds(tx);
      let stageChanges = 0;

      for (const entry of entries) {
        const seat = seats.find((s) => s.application_id === entry.application_id)!;
        await tx.tbl_exam_session_applicant.update({
          where: { session_id_application_id: { session_id: sessionId, application_id: entry.application_id } },
          data: {
            attendance: entry.present ? ATTENDANCE.PRESENT : ATTENDANCE.ABSENT,
            marked_by: accountId,
            marked_at: now,
          },
        });

        const stage = seat.tbl_application.current_stage_id;
        let nextStage: number | null = null;
        if (entry.present && stage === forExamination) nextStage = examCompleted;
        if (!entry.present && stage === examCompleted && seat.tbl_application._count.tbl_exam_result === 0) {
          nextStage = forExamination;
        }

        if (nextStage) {
          await tx.tbl_application.update({
            where: { application_id: entry.application_id },
            data: { current_stage_id: nextStage },
          });
          await tx.tbl_application_stage_log.create({
            data: {
              application_id: entry.application_id,
              stage_id: nextStage,
              changed_by: accountId,
              remarks: entry.present ? "Marked present at the exam." : "Marked absent at the exam.",
            },
          });
          stageChanges++;
        }
      }
      return stageChanges;
    });

    revalidate();
    revalidatePath("/admission/tracker");
    return {
      success: true,
      message: `Attendance saved${moved ? ` (${moved} stage update${moved === 1 ? "" : "s"})` : ""}.`,
    };
  } catch (error) {
    return failure("Save attendance", error);
  }
}
