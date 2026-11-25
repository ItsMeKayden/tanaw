// Emails sent to applicants when their exam result moves them to Passed, Waitlisted or Failed.
import { z } from "zod";

import { ADMISSION_STAGES } from "@/features/admission/stages";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

const emailSchema = z.email();

/** Stages that get a result email. */
const RESULT_STAGES: readonly string[] = [
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.WAITLISTED,
  ADMISSION_STAGES.FAILED,
];

/** One applicant whose admission stage was changed by their exam result. */
export type ResultChange = { applicationId: number; from: string | null; to: string };

export type ResultEmailSummary = { sent: number; noEmail: number; failed: number; configured: boolean };

type Template = { subject: string; heading: string; paragraphs: string[] };

function template(to: string, isUpdate: boolean): Template | null {
  const prefix = isUpdate ? "Updated exam result: " : "";
  const update = isUpdate
    ? ["Your exam result has been reviewed and updated. This email replaces any earlier result we sent you."]
    : [];
  switch (to) {
    case ADMISSION_STAGES.PASSED:
      return {
        subject: `${prefix}You passed the QCU entrance exam`,
        heading: "Congratulations! You passed the Quezon City University entrance exam.",
        paragraphs: [
          ...update,
          "A slot has been reserved for you in your chosen program. The QCU Admission Office will contact you about the enrollment requirements and schedule.",
        ],
      };
    case ADMISSION_STAGES.WAITLISTED:
      return {
        subject: `${prefix}You passed the QCU entrance exam and are on the waiting list`,
        heading: "You passed the Quezon City University entrance exam.",
        paragraphs: [
          ...update,
          "However, all slots in your chosen program are currently filled, so you have been placed on the waiting list.",
          "If a slot opens up, the QCU Admission Office will contact you with the next steps. No action is needed from you for now.",
        ],
      };
    case ADMISSION_STAGES.FAILED:
      return {
        subject: `${prefix}Your QCU entrance exam result`,
        heading: "Thank you for taking the Quezon City University entrance exam.",
        paragraphs: [
          ...update,
          "We regret to inform you that you did not reach the passing score for this admission cycle.",
          "We encourage you to apply again in a future admission cycle.",
        ],
      };
    default:
      return null;
  }
}

/**
 * Emails each applicant their new exam result. Never throws: the results are
 * already saved, so mail problems are only counted and logged. A change from
 * one result stage to another is sent as an "updated result".
 */
export async function sendResultEmails(changes: ResultChange[]): Promise<ResultEmailSummary> {
  const summary: ResultEmailSummary = { sent: 0, noEmail: 0, failed: 0, configured: isMailConfigured() };
  const relevant = changes.filter((change) => RESULT_STAGES.includes(change.to));
  if (relevant.length === 0) return summary;

  const applications = await prisma.tbl_application.findMany({
    where: { application_id: { in: relevant.map((change) => change.applicationId) } },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: { select: { first_name: true, email: true } },
      tbl_program: { select: { program_code: true, program_name: true } },
      tbl_branch: { select: { branch_name: true } },
      tbl_admission_cycle: { select: { school_year: true } },
      tbl_exam_result: { select: { percentage: true }, orderBy: { result_id: "desc" }, take: 1 },
    },
  });
  const byId = new Map(applications.map((application) => [application.application_id, application]));

  // One at a time, so a large batch doesn't open hundreds of SMTP connections at once.
  for (const change of relevant) {
    const application = byId.get(change.applicationId);
    const to = application?.tbl_applicant?.email?.trim();
    if (!application || !to || !emailSchema.safeParse(to).success) {
      summary.noEmail++;
      continue;
    }

    const isUpdate = change.from !== null && RESULT_STAGES.includes(change.from);
    const content = template(change.to, isUpdate)!;
    const percentage = application.tbl_exam_result[0]?.percentage;
    const program = application.tbl_program
      ? `${application.tbl_program.program_name} (${application.tbl_program.program_code})`
      : null;
    const details: [string, string | null | undefined][] = [
      ["Application No.", application.application_no],
      ["Program", program],
      ["Campus", application.tbl_branch?.branch_name],
      ["School Year", application.tbl_admission_cycle?.school_year],
      ["Exam Score", percentage == null ? null : `${Number(percentage).toFixed(2)}%`],
    ];
    const shown = details.filter((entry): entry is [string, string] => Boolean(entry[1]));
    const firstName = application.tbl_applicant!.first_name;

    try {
      await sendMail({
        to,
        subject: content.subject,
        text: [
          `Hi ${firstName},`,
          "",
          content.heading,
          "",
          ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
          ...shown.map(([label, value]) => `${label}: ${value}`),
          "",
          "For questions, contact the QCU Admission Office.",
        ].join("\n"),
        html: `<p>Hi ${escapeHtml(firstName)},</p>
<p><strong>${escapeHtml(content.heading)}</strong></p>
${content.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
<table style="border-collapse:collapse;margin:12px 0">
${shown
  .map(
    ([label, value]) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;color:#191e73">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
<p>For questions, contact the QCU Admission Office.</p>`,
      });
      summary.sent++;
    } catch (error) {
      console.error(`Result email for application ${change.applicationId} failed:`, error);
      summary.failed++;
    }
  }
  return summary;
}

/** Emails the results after the response is sent, logging the outcome. */
export async function sendResultEmailsInBackground(changes: ResultChange[]) {
  const summary = await sendResultEmails(changes).catch((error) => {
    console.error("Result emails failed:", error);
    return null;
  });
  if (summary) {
    console.info(
      `[mail] Result emails: ${summary.sent} sent${summary.configured ? "" : " (printed to console; SMTP not configured)"}, ` +
        `${summary.noEmail} without a valid email, ${summary.failed} failed.`,
    );
  }
}

/** Sentence appended to the save toast. */
export function describeResultEmails(changes: ResultChange[]) {
  const count = changes.filter((change) => RESULT_STAGES.includes(change.to)).length;
  if (count === 0) return "";
  return ` Result email${count === 1 ? " is" : "s are"} being sent to ${count} applicant${count === 1 ? "" : "s"} whose result changed.`;
}
