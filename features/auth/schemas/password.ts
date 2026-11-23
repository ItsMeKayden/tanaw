/**
 * Zod schemas for changing and resetting passwords, shared by the forms and
 * the server actions. Safe to import anywhere.
 */
import { z } from "zod";

// bcrypt only uses the first 72 bytes, so longer passwords are rejected.
const newPasswordField = z
  .string()
  .min(8, "Password must be between 8 and 72 characters.")
  .max(72, "Password must be between 8 and 72 characters.");

const passwordsMatch = (values: { newPassword: string; confirmPassword: string }) =>
  values.newPassword === values.confirmPassword;
const mismatch = { message: "Passwords do not match.", path: ["confirmPassword"] };

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch)
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "The new password must be different from your current one.",
    path: ["newPassword"],
  });
export type ChangePasswordValues = z.input<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(150, "Email must not exceed 150 characters.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address."),
});
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "This reset link is invalid."),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch);
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;

export type PasswordActionResult =
  | { success: true; message: string }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

/** First message per field, for showing server-side validation under inputs. */
export function fieldErrorsOf(issues: z.core.$ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (field) fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}
