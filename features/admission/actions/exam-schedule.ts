"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { getAccountId, requireAnyPermission } from "@/lib/authorization";
import { EXAM_SCHEDULE_MODULES, EXAM_SCHEDULE_PATHS } from "@/features/admission/access";
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { ensureCycleExam, getApplicantsToSchedule, isSessionFinished, isSessionStarted } from "@/features/admission/exam";
import { ATTENDANCE, manilaTodayIso } from "@/features/admission/exam-scoring";
import { describeScheduleEmails, sendExamScheduleEmails } from "@/features/admission/exam-schedule-email";
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
  // "YYYY-MM-DD" strings compare correctly as text.
  if (data.session_date < manilaTodayIso()) return { error: "The exam date can't be in the past." };

  try {
    const accountId = getAccountId(user);
    const session = await prisma.$transaction(async (tx) => {
      const exam = await ensureCycleExam(tx, cycleId);
      if (data.exam_set === "B" && (await tx.tbl_exam_question.count({ where: { exam_id: exam.exam_id, set_label: "B" } })) === 0) {
        throw new Error("This exam has no Set B yet. Create it on the Exam Questions page first.");
      }
      return tx.tbl_exam_session.create({
        data: {
          exam_id: exam.exam_id,
          session_date: new Date(`${data.session_date}T00:00:00.000Z`),
          start_time: data.start_time || null,
          end_time: data.end_time || null,
          venue: data.venue,
          room: data.room || null,
          capacity: Number(data.capacity),
          exam_set: data.exam_set,
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

const ARCHIVED_ERROR = "This session is archived. Restore it first.";

/** Changes which exam set a session takes; only before the session starts. */
export async function setSessionExamSet(sessionIdInput: number, setInput: string): Promise<ActionResult> {
  await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");
  const sessionId = validId(sessionIdInput);
  if (!sessionId || (setInput !== "A" && setInput !== "B")) return { error: "Invalid exam set." };

  try {
    const session = await prisma.tbl_exam_session.findUnique({
      where: { session_id: sessionId },
      select: { exam_id: true, session_date: true, start_time: true, archived_at: true },
    });
    if (!session) return { error: "Exam session not found." };
    if (session.archived_at) return { error: ARCHIVED_ERROR };
    if (isSessionStarted(session.session_date, session.start_time)) {
      return { error: "This session has already started, so its exam set can't change." };
    }
    if (setInput === "B") {
      const count = await prisma.tbl_exam_question.count({ where: { exam_id: session.exam_id, set_label: "B" } });
      if (count === 0) return { error: "This exam has no Set B yet. Create it on the Exam Questions page first." };
    }
    await prisma.tbl_exam_session.update({ where: { session_id: sessionId }, data: { exam_set: setInput } });
    revalidate();
    return { success: true, message: `Session now takes Set ${setInput}.` };
  } catch (error) {
    return failure("Change exam set", error);
  }
}

/**
 * Archives a session instead of deleting it; it moves to the Archived tab and
 * can be restored. Nothing is deleted from a finished session (its seats and
 * attendance are history). For a session that hasn't happened yet, applicants
 * without an exam score get their seat back, so they return to the waiting
 * list and can be scheduled in another session.
 */
export async function archiveExamSession(sessionIdInput: number): Promise<ActionResult> {
  const user = await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };

  try {
    const accountId = getAccountId(user);
    const released = await prisma.$transaction(async (tx) => {
      const session = await tx.tbl_exam_session.findUnique({
        where: { session_id: sessionId },
        select: { session_date: true, end_time: true, archived_at: true },
      });
      if (!session) throw new Error("Exam session not found.");
      if (session.archived_at) throw new Error("This session is already archived.");

      let count = 0;
      if (!isSessionFinished(session.session_date, session.end_time)) {
        const unscored = await tx.tbl_exam_session_applicant.findMany({
          where: { session_id: sessionId, tbl_application: { tbl_exam_result: { none: {} } } },
          select: { application_id: true, tbl_application: { select: { current_stage_id: true } } },
        });
        const { forExamination, examCompleted } = await stageIds(tx);
        await tx.tbl_exam_session_applicant.deleteMany({
          where: { session_id: sessionId, application_id: { in: unscored.map((s) => s.application_id) } },
        });
        // Marked present but not scored yet: back to waiting for the exam.
        const revert = unscored
          .filter((s) => forExamination && s.tbl_application.current_stage_id === examCompleted)
          .map((s) => s.application_id);
        if (forExamination && revert.length > 0) {
          await tx.tbl_application.updateMany({
            where: { application_id: { in: revert } },
            data: { current_stage_id: forExamination },
          });
          await tx.tbl_application_stage_log.createMany({
            data: revert.map((application_id) => ({
              application_id,
              stage_id: forExamination,
              changed_by: accountId,
              remarks: "Exam session archived; waiting to be scheduled again.",
            })),
          });
        }
        count = unscored.length;
      }

      await tx.tbl_exam_session.update({
        where: { session_id: sessionId },
        data: { archived_at: new Date(), archived_by: accountId },
      });
      return count;
    });

    revalidate();
    const who = released === 1 ? "1 applicant was" : `${released} applicants were`;
    const note = released ? ` ${who} returned to the waiting list.` : "";
    return { success: true, message: `Exam session archived.${note}` };
  } catch (error) {
    return failure("Archive exam session", error);
  }
}

/** Brings an archived session back to the schedule (released applicants are not re-seated). */
export async function restoreExamSession(sessionIdInput: number): Promise<ActionResult> {
  await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };

  try {
    const restored = await prisma.tbl_exam_session.updateMany({
      where: { session_id: sessionId, archived_at: { not: null } },
      data: { archived_at: null, archived_by: null },
    });
    if (restored.count === 0) return { error: "Archived session not found." };
    revalidate();
    return { success: true, message: "Exam session restored.", sessionId };
  } catch (error) {
    return failure("Restore exam session", error);
  }
}

/**
 * Fills unscheduled applicants of the session's cycle who are in the
 * "For Examination" stage, earliest application first, up to capacity, and
 * emails each of them the exam date, time and venue.
 */
export async function fillSessionSlots(sessionIdInput: number): Promise<ActionResult> {
  const user = await requireAnyPermission(EXAM_SCHEDULE_MODULES, "write");

  const sessionId = validId(sessionIdInput);
  if (!sessionId) return { error: "Invalid exam session." };

  try {
    const accountId = getAccountId(user);
    const added = await prisma.$transaction(async (tx) => {
      const session = await tx.tbl_exam_session.findUnique({
        where: { session_id: sessionId },
        select: {
          capacity: true,
          session_date: true,
          end_time: true,
          archived_at: true,
          tbl_exam: { select: { cycle_id: true } },
          _count: { select: { tbl_exam_session_applicant: { where: { tbl_application: ACTIVE_APPLICATION } } } },
        },
      });
      if (!session) throw new Error("Exam session not found.");
      if (session.archived_at) throw new Error(ARCHIVED_ERROR);
      if (isSessionFinished(session.session_date, session.end_time)) {
        throw new Error("This session has ended; it is locked.");
      }

      const open = session.capacity - session._count.tbl_exam_session_applicant;
      if (open <= 0) throw new Error("This session is already full.");

      const { forExamination } = await stageIds(tx);
      if (!forExamination || !session.tbl_exam.cycle_id) return { ids: [], moved: 0 };

      const applicants = (await getApplicantsToSchedule(tx, session.tbl_exam.cycle_id)).slice(0, open);
      const fresh = applicants.filter((a) => a.previousSessionId === null);
      const rescheduled = applicants.filter((a) => a.previousSessionId !== null);

      if (fresh.length > 0) {
        await tx.tbl_exam_session_applicant.createMany({
          data: fresh.map((a) => ({ session_id: sessionId, application_id: a.application_id })),
          skipDuplicates: true,
        });
      }

      // One seat per applicant: move the old seat (missed or archived session) here.
      // The old attendance stays in the audit log; the move is noted in the stage history.
      if (rescheduled.length > 0) {
        await tx.tbl_exam_session_applicant.updateMany({
          where: { application_id: { in: rescheduled.map((a) => a.application_id) } },
          data: { session_id: sessionId, attendance: null, marked_by: null, marked_at: null },
        });
        await tx.tbl_application_stage_log.createMany({
          data: rescheduled.map((a) => ({
            application_id: a.application_id,
            stage_id: forExamination,
            changed_by: accountId,
            remarks: "Rescheduled to a new exam session (missed or archived session).",
          })),
        });
      }
      return { ids: applicants.map((a) => a.application_id), moved: rescheduled.length };
    });

    revalidate();
    if (added.ids.length === 0) return { error: "No unscheduled applicants are waiting for the exam." };

    // Seats are saved; email problems are reported, never undo them.
    const emails = await sendExamScheduleEmails(sessionId, added.ids).catch(() => null);
    const note = emails ? describeScheduleEmails(emails) : "Schedule emails could not be sent.";
    const count = added.ids.length;
    const movedNote = added.moved ? ` (${added.moved} rescheduled from an earlier session)` : "";
    const message = `${count} applicant${count === 1 ? "" : "s"} added to the session${movedNote}.`;
    return { success: true, message: note ? `${message} ${note}` : message };
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
    const session = await prisma.tbl_exam_session.findUnique({
      where: { session_id: sessionId },
      select: { session_date: true, end_time: true, archived_at: true },
    });
    if (!session) return { error: "Exam session not found." };
    if (session.archived_at) return { error: ARCHIVED_ERROR };
    if (isSessionFinished(session.session_date, session.end_time)) {
      return { error: "This session has ended; it is locked." };
    }

    const scored = await prisma.tbl_exam_result.count({ where: { application_id: applicationId } });
    if (scored > 0) {
      return { error: "This applicant already has an exam score, so they can't be removed from the session." };
    }

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
 * Scores require attendance, so a scored applicant can't be changed to absent
 * (their result, stage and course recommendations would no longer match).
 */
function assertNoScoredMarkedAbsent(
  entries: { application_id: number; present: boolean }[],
  seats: {
    application_id: number;
    attendance: string | null;
    tbl_application: { application_no: string; _count: { tbl_exam_result: number } };
  }[],
) {
  const blocked = entries
    .map((entry) => ({ entry, seat: seats.find((s) => s.application_id === entry.application_id)! }))
    .filter(
      ({ entry, seat }) =>
        !entry.present && seat.attendance !== ATTENDANCE.ABSENT && seat.tbl_application._count.tbl_exam_result > 0,
    )
    .map(({ seat }) => seat.tbl_application.application_no);
  if (blocked.length === 0) return;
  const one = blocked.length === 1;
  throw new Error(
    `${blocked.join(", ")} already ${one ? "has an exam score" : "have exam scores"}, so ${one ? "it" : "they"} can't be marked absent.`,
  );
}

/**
 * Saves attendance for a session. Present applicants still "For Examination"
 * move to "Exam Completed"; an applicant changed to absent moves back if
 * they have no exam result yet. An applicant with an exam result can't be
 * changed to absent. Only open from the session's start until its end, and
 * only changed rows get a new marked_at. Stage changes are logged.
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

    const session = await prisma.tbl_exam_session.findUnique({
      where: { session_id: sessionId },
      select: { session_date: true, start_time: true, end_time: true, archived_at: true },
    });
    if (!session) return { error: "Exam session not found." };
    if (session.archived_at) return { error: ARCHIVED_ERROR };
    if (!isSessionStarted(session.session_date, session.start_time)) {
      return { error: "This session hasn't started yet. Attendance opens at its start time." };
    }
    if (isSessionFinished(session.session_date, session.end_time)) {
      return { error: "This session has ended; attendance is locked." };
    }

    const moved = await prisma.$transaction(async (tx) => {
      const seats = await tx.tbl_exam_session_applicant.findMany({
        where: { session_id: sessionId, application_id: { in: entries.map((e) => e.application_id) } },
        select: {
          application_id: true,
          attendance: true,
          tbl_application: {
            select: { application_no: true, current_stage_id: true, _count: { select: { tbl_exam_result: true } } },
          },
        },
      });
      if (seats.length !== entries.length) throw new Error("The applicant list changed. Reload the page.");

      assertNoScoredMarkedAbsent(entries, seats);

      const { forExamination, examCompleted } = await stageIds(tx);
      let stageChanges = 0;

      for (const entry of entries) {
        const seat = seats.find((s) => s.application_id === entry.application_id)!;
        const attendance = entry.present ? ATTENDANCE.PRESENT : ATTENDANCE.ABSENT;
        // Unchanged rows keep the time (and person) they were first marked with.
        if (seat.attendance !== attendance) {
          await tx.tbl_exam_session_applicant.update({
            where: { session_id_application_id: { session_id: sessionId, application_id: entry.application_id } },
            data: { attendance, marked_by: accountId, marked_at: now },
          });
        }

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
    return {
      success: true,
      message: `Attendance saved${moved ? ` (${moved} stage update${moved === 1 ? "" : "s"})` : ""}.`,
    };
  } catch (error) {
    return failure("Save attendance", error);
  }
}
