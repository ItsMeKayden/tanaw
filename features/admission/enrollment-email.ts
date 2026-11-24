// Confirmation email sent to an applicant once their enrollment is verified.
import { z } from "zod";

import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

export type EnrollmentEmailResult =
  | { status: "sent"; to: string }
  | { status: "not-configured"; to: string }
  | { status: "no-email" }
  | { status: "failed"; to: string };

const emailSchema = z.email();

/**
 * Emails the applicant that they are officially enrolled. Never throws: the
 * enrollment is already saved, so a mail problem is only reported back.
 */
export async function sendEnrollmentEmail(applicationId: number): Promise<EnrollmentEmailResult> {
  const application = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    select: {
      application_no: true,
      tbl_applicant: { select: { first_name: true, last_name: true, email: true } },
      tbl_program: { select: { program_code: true, program_name: true } },
      tbl_branch: { select: { branch_name: true } },
      tbl_admission_cycle: { select: { school_year: true } },
    },
  });

  const to = application?.tbl_applicant?.email?.trim();
  if (!application || !to || !emailSchema.safeParse(to).success) return { status: "no-email" };

  const applicant = application.tbl_applicant!;
  const program = application.tbl_program
    ? `${application.tbl_program.program_name} (${application.tbl_program.program_code})`
    : null;
  const details: [string, string | null | undefined][] = [
    ["Application No.", application.application_no],
    ["Program", program],
    ["Campus", application.tbl_branch?.branch_name],
    ["School Year", application.tbl_admission_cycle?.school_year],
  ];
  const shown = details.filter((entry): entry is [string, string] => Boolean(entry[1]));

  try {
    await sendMail({
      to,
      subject: "You are officially enrolled at Quezon City University",
      text: [
        `Hi ${applicant.first_name},`,
        "",
        "Congratulations! Your enrollment requirements have been verified and you are now officially enrolled at Quezon City University.",
        "",
        ...shown.map(([label, value]) => `${label}: ${value}`),
        "",
        "Please keep this email for your records. For questions, contact the QCU Admission Office.",
      ].join("\n"),
      html: `<p>Hi ${escapeHtml(applicant.first_name)},</p>
<p><strong>Congratulations!</strong> Your enrollment requirements have been verified and you are now <strong>officially enrolled</strong> at Quezon City University.</p>
<table style="border-collapse:collapse;margin:12px 0">
${shown
  .map(
    ([label, value]) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;color:#191e73">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
<p>Please keep this email for your records. For questions, contact the QCU Admission Office.</p>`,
    });
    return { status: isMailConfigured() ? "sent" : "not-configured", to };
  } catch (error) {
    console.error(`Enrollment email for application ${applicationId} failed:`, error);
    return { status: "failed", to };
  }
}

/** Sentence appended to the "verified as enrolled" toast. */
export function describeEnrollmentEmail(result: EnrollmentEmailResult) {
  switch (result.status) {
    case "sent":
      return `A confirmation email was sent to ${result.to}.`;
    case "not-configured":
      return "Email is not configured, so the confirmation was only printed to the server console.";
    case "no-email":
      return "No valid email is on file, so no confirmation email was sent.";
    case "failed":
      return `The confirmation email to ${result.to} could not be sent.`;
  }
}
