// Emails sent to applicants when their exam result moves them to Passed, Waitlisted or Failed.
// The wording lives in result-email-template.ts.
import { z } from "zod";

import { buildResultEmail, RESULT_STAGES } from "@/features/admission/result-email-template";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

const emailSchema = z.email();

/** One applicant whose admission stage was changed by their exam result. */
export type ResultChange = { applicationId: number; from: string | null; to: string };

export type ResultEmailSummary = { sent: number; noEmail: number; failed: number; configured: boolean };

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

    const percentage = application.tbl_exam_result[0]?.percentage;
    const message = buildResultEmail(to, change.to, change.from !== null && RESULT_STAGES.includes(change.from), {
      firstName: application.tbl_applicant!.first_name,
      applicationNo: application.application_no,
      program: application.tbl_program
        ? `${application.tbl_program.program_name} (${application.tbl_program.program_code})`
        : null,
      campus: application.tbl_branch?.branch_name,
      schoolYear: application.tbl_admission_cycle?.school_year,
      score: percentage == null ? null : Number(percentage),
    })!;

    try {
      await sendMail(message);
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
