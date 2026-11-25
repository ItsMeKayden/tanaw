// Email sent to applicants when they are seated in an exam session.
import { z } from "zod";

import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

const emailSchema = z.email();

const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC", // the DATE column is the PH date at UTC midnight
});

function formatTime(value: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type ScheduleEmailSummary = { sent: number; noEmail: number; failed: number; configured: boolean };

/**
 * Emails each newly seated applicant their exam date, time and venue. Never
 * throws: the seats are already saved, so mail problems are only counted.
 */
export async function sendExamScheduleEmails(
  sessionId: number,
  applicationIds: number[],
): Promise<ScheduleEmailSummary> {
  const summary: ScheduleEmailSummary = { sent: 0, noEmail: 0, failed: 0, configured: isMailConfigured() };
  if (applicationIds.length === 0) return summary;

  const [session, applications] = await Promise.all([
    prisma.tbl_exam_session.findUnique({
      where: { session_id: sessionId },
      select: { session_date: true, start_time: true, end_time: true, venue: true, room: true },
    }),
    prisma.tbl_application.findMany({
      where: { application_id: { in: applicationIds } },
      select: {
        application_no: true,
        tbl_applicant: { select: { first_name: true, email: true } },
        tbl_admission_cycle: { select: { school_year: true } },
      },
    }),
  ]);
  if (!session) return summary;

  const date = longDate.format(session.session_date);
  const start = formatTime(session.start_time);
  const end = formatTime(session.end_time);
  const time = start ? (end ? `${start} – ${end}` : start) : null;
  const venue = session.room ? `${session.venue}, Room ${session.room}` : session.venue;

  for (const application of applications) {
    const to = application.tbl_applicant?.email?.trim();
    if (!to || !emailSchema.safeParse(to).success) {
      summary.noEmail++;
      continue;
    }

    const name = application.tbl_applicant?.first_name ?? "Applicant";
    const details: [string, string][] = [
      ["Date", date],
      ...(time ? ([["Time", time]] as [string, string][]) : []),
      ["Venue", venue],
      ["Application No.", application.application_no],
      ...(application.tbl_admission_cycle?.school_year
        ? ([["School Year", application.tbl_admission_cycle.school_year]] as [string, string][])
        : []),
    ];

    try {
      await sendMail({
        to,
        subject: `Your QCU admission exam schedule: ${date}`,
        text: [
          `Hi ${name},`,
          "",
          "You have been scheduled for the Quezon City University admission exam.",
          "",
          ...details.map(([label, value]) => `${label}: ${value}`),
          "",
          "Please arrive before the start time and bring this email or your application number.",
          "For questions, contact the QCU Admission Office.",
        ].join("\n"),
        html: `<p>Hi ${escapeHtml(name)},</p>
<p>You have been scheduled for the <strong>Quezon City University admission exam</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0">
${details
  .map(
    ([label, value]) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;color:#191e73">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
<p>Please arrive before the start time and bring this email or your application number.</p>
<p>For questions, contact the QCU Admission Office.</p>`,
      });
      summary.sent++;
    } catch (error) {
      console.error(`Exam schedule email for ${application.application_no} failed:`, error);
      summary.failed++;
    }
  }

  return summary;
}

/** Sentence appended to the "applicants added" message. */
export function describeScheduleEmails(summary: ScheduleEmailSummary) {
  const parts: string[] = [];
  if (summary.sent) {
    parts.push(
      summary.configured
        ? `Schedule emailed to ${summary.sent}.`
        : `Email isn't configured, so ${summary.sent} schedule email${summary.sent === 1 ? " was" : "s were"} only printed to the server console.`,
    );
  }
  if (summary.noEmail) parts.push(`${summary.noEmail} without a valid email weren't notified.`);
  if (summary.failed) parts.push(`${summary.failed} email${summary.failed === 1 ? "" : "s"} could not be sent.`);
  return parts.join(" ");
}
