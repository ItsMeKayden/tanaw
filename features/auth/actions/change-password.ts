"use server";

import { compare, hash } from "bcryptjs";

import { getAccountId, requireUser } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  changePasswordSchema,
  fieldErrorsOf,
  type ChangePasswordValues,
  type PasswordActionResult,
} from "@/features/auth/schemas/password";

/** Changes the signed-in user's own password after checking the current one. */
export async function changePassword(input: ChangePasswordValues): Promise<PasswordActionResult> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const userId = getAccountId(user);
    const account = await prisma.tbl_user_account.findUnique({
      where: { user_id: userId },
      select: { password_hash: true, is_active: true },
    });
    if (!account || account.is_active !== true) {
      return { success: false, message: "Your account is no longer active." };
    }

    if (!(await compare(currentPassword, account.password_hash))) {
      const message = "Your current password is incorrect.";
      return { success: false, message, fieldErrors: { currentPassword: message } };
    }

    await prisma.$transaction([
      prisma.tbl_user_account.update({
        where: { user_id: userId },
        data: { password_hash: await hash(newPassword, 12) },
      }),
      // Any reset link still in someone's inbox stops working.
      prisma.tbl_password_reset_token.deleteMany({ where: { user_id: userId } }),
    ]);

    return { success: true, message: "Your password was changed." };
  } catch (error) {
    console.error("Change password failed:", error);
    return { success: false, message: "Failed to change your password. Please try again." };
  }
}
