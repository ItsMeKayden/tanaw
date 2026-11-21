import nodemailer from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** false = emails are only printed to the console (development without SMTP). */
export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Sends an email through the SMTP server in .env (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, MAIL_FROM). Outside production, when SMTP isn't
 * configured, the message is printed to the server console instead so the
 * flow can be tested locally.
 */
export async function sendMail(message: MailMessage) {
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
