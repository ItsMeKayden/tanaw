import nodemailer from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Escapes text for use inside an email's HTML body. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** false = emails are only printed to the console (development without SMTP). */
export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Testing aid: with MAIL_REDIRECT_TO set (outside production), every email
 * goes to that address instead of the real recipient, with the intended
 * recipient shown in the subject. Lets you test real flows without
 * emailing applicants.
 */
function applyRedirect(message: MailMessage): MailMessage {
  const redirect = process.env.MAIL_REDIRECT_TO?.trim();
  if (!redirect || process.env.NODE_ENV === "production") return message;
  return { ...message, to: redirect, subject: `[TEST → ${message.to}] ${message.subject}` };
}

/**
 * Sends an email through the SMTP server in .env (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, MAIL_FROM). Outside production, when SMTP isn't
 * configured, the message is printed to the server console instead so the
 * flow can be tested locally.
 */
export async function sendMail(original: MailMessage) {
  const message = applyRedirect(original);
  const host = process.env.SMTP_HOST;

  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST is not set; cannot send email.");
    }
    console.info(
      `\n[mail] SMTP not configured — email not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    ...message,
  });
}
