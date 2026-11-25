// Wording and layout of the exam result emails (Passed / Waitlisted / Failed).
// Kept free of database access so scripts/test-result-emails.ts can render it.
import { ADMISSION_STAGES } from "@/features/admission/stages";
import { escapeHtml, type MailMessage } from "@/lib/mailer";

/** Stages that get a result email. */
export const RESULT_STAGES: readonly string[] = [
  ADMISSION_STAGES.PASSED,
  ADMISSION_STAGES.WAITLISTED,
  ADMISSION_STAGES.FAILED,
];

export type ResultEmailDetails = {
  firstName: string;
  applicationNo?: string | null;
  program?: string | null;
  campus?: string | null;
  schoolYear?: string | null;
  /** Exam percentage, 0–100. */
  score?: number | null;
};

type Content = { subject: string; heading: string; paragraphs: string[] };

function content(stage: string, isUpdate: boolean): Content | null {
  const prefix = isUpdate ? "Updated exam result: " : "";
  const update = isUpdate
    ? ["Your exam result has been reviewed and updated. This email replaces any earlier result we sent you."]
    : [];
  switch (stage) {
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

/** The result email for a stage, or null if that stage gets no email. */
export function buildResultEmail(
  to: string,
  stage: string,
  isUpdate: boolean,
  details: ResultEmailDetails,
): MailMessage | null {
  const body = content(stage, isUpdate);
  if (!body) return null;

  const rows: [string, string | null | undefined][] = [
    ["Application No.", details.applicationNo],
    ["Program", details.program],
    ["Campus", details.campus],
    ["School Year", details.schoolYear],
    ["Exam Score", details.score == null ? null : `${details.score.toFixed(2)}%`],
  ];
  const shown = rows.filter((row): row is [string, string] => Boolean(row[1]));

  return {
    to,
    subject: body.subject,
    text: [
      `Hi ${details.firstName},`,
      "",
      body.heading,
      "",
      ...body.paragraphs.flatMap((paragraph) => [paragraph, ""]),
      ...shown.map(([label, value]) => `${label}: ${value}`),
      "",
      "For questions, contact the QCU Admission Office.",
    ].join("\n"),
    html: `<p>Hi ${escapeHtml(details.firstName)},</p>
<p><strong>${escapeHtml(body.heading)}</strong></p>
${body.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
<table style="border-collapse:collapse;margin:12px 0">
${shown
  .map(
    ([label, value]) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;color:#191e73">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
<p>For questions, contact the QCU Admission Office.</p>`,
  };
}
