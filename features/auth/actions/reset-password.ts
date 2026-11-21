"use server";

import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { headers } from "next/headers";

import { isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import {
  fieldErrorsOf,
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordValues,
  type PasswordActionResult,
  type ResetPasswordValues,
} from "@/features/auth/schemas/password";

const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour
const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // one email per account every 2 minutes

// Same reply whether or not the email has an account, so the form can't be
// used to find out which addresses are registered.
const SENT_MESSAGE =
  "If an active account uses that email, a link to reset the password has been sent. It expires in 1 hour.";

function sentResult(): PasswordActionResult {
  // In development without SMTP the link only goes to the server console;
  // say so instead of leaving someone waiting for an email.
  const message = isMailConfigured() || process.env.NODE_ENV === "production"
    ? SENT_MESSAGE
    : `${SENT_MESSAGE} (Development: email isn't configured, so the link was printed in the server terminal instead.)`;
  return { success: true, message };
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Base URL for links in emails. APP_URL is required in production; in
 * development it falls back to the request's host.
 */
async function appUrl() {
  const configured = process.env.APP_URL ?? process.env.AUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is not set; cannot build the password reset link.");
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/** Emails a one-time reset link to the account with this email, if any. */
export async function requestPasswordReset(input: ForgotPasswordValues): Promise<PasswordActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const { email } = parsed.data;

  try {
    const account = await prisma.tbl_user_account.findFirst({
      where: { email, is_active: true },
      select: { user_id: true, full_name: true, email: true },
    });
    if (!account) return sentResult();

    const recent = await prisma.tbl_password_reset_token.findFirst({
      where: { user_id: account.user_id, created_at: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      select: { token_id: true },
    });
    if (recent) return sentResult();

    const token = randomBytes(32).toString("base64url");
    // Only the newest link works.
    await prisma.$transaction([
      prisma.tbl_password_reset_token.deleteMany({ where: { user_id: account.user_id } }),
      prisma.tbl_password_reset_token.create({
        data: {
          user_id: account.user_id,
          token_hash: hashToken(token),
          expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS),
        },
      }),
    ]);

    const link = `${await appUrl()}/auth/reset-password?token=${token}`;
    await sendMail({
      to: account.email,
      subject: "Reset your QCU TANAW password",
      text: [
        `Hi ${account.full_name},`,
        "",
        "We received a request to reset the password for your QCU TANAW account.",
        "Open this link to choose a new password (it expires in 1 hour):",
        link,
        "",
        "If you didn't ask for this, you can ignore this email; your password won't change.",
      ].join("\n"),
      html: `<p>Hi ${escapeHtml(account.full_name)},</p>
<p>We received a request to reset the password for your QCU TANAW account.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#191e73;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p>
<p>Or open this link: <a href="${link}">${link}</a><br>It expires in 1 hour.</p>
<p>If you didn't ask for this, you can ignore this email; your password won't change.</p>`,
    });

    return sentResult();
  } catch (error) {
    console.error("Password reset request failed:", error);
    return { success: false, message: "We couldn't send the reset email. Please try again later." };
  }
}

/** Whether a reset link can still be used (for showing the form or an error). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const record = await prisma.tbl_password_reset_token.findUnique({
    where: { token_hash: hashToken(token) },
    select: { expires_at: true, used_at: true, user: { select: { is_active: true } } },
  });
  return Boolean(record && !record.used_at && record.expires_at > new Date() && record.user.is_active);
}

/** Sets a new password using a reset link's token. Each link works once. */
export async function resetPassword(input: ResetPasswordValues): Promise<PasswordActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const { token, newPassword } = parsed.data;
  const expired = "This reset link is invalid or has expired. Request a new one.";

  try {
    const record = await prisma.tbl_password_reset_token.findUnique({
      where: { token_hash: hashToken(token) },
      select: { token_id: true, user_id: true, expires_at: true, used_at: true, user: { select: { is_active: true } } },
    });
    if (!record || record.used_at || record.expires_at <= new Date() || !record.user.is_active) {
      return { success: false, message: expired };
    }

    const passwordHash = await hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
      // Claim the token first so two submissions can't both use it.
      const claimed = await tx.tbl_password_reset_token.updateMany({
        where: { token_id: record.token_id, used_at: null },
        data: { used_at: new Date() },
      });
      if (claimed.count === 0) throw new TokenAlreadyUsed();

      await tx.tbl_user_account.update({
        where: { user_id: record.user_id },
        data: { password_hash: passwordHash },
      });
      await tx.tbl_password_reset_token.deleteMany({
        where: { user_id: record.user_id, token_id: { not: record.token_id } },
      });
    });

    return { success: true, message: "Your password was reset. You can now sign in." };
  } catch (error) {
    if (error instanceof TokenAlreadyUsed) return { success: false, message: expired };
    console.error("Password reset failed:", error);
    return { success: false, message: "Failed to reset your password. Please try again." };
  }
}

class TokenAlreadyUsed extends Error {}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
