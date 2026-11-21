"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";
import { changePassword } from "@/features/auth/actions/change-password";
import { changePasswordSchema, type ChangePasswordValues } from "@/features/auth/schemas/password";

const blank: ChangePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

const inputClass = (hasError: boolean) =>
  `h-9 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-500 focus:ring-red-500/20"
      : "border-neutral-500 focus:border-[#191e73] focus:ring-[#191e73]/20"
  }`;

const FIELDS: { name: keyof ChangePasswordValues; label: string; autoComplete: string }[] = [
  { name: "currentPassword", label: "Current Password", autoComplete: "current-password" },
  { name: "newPassword", label: "New Password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm New Password", autoComplete: "new-password" },
];

/** Lets the signed-in user change their own password (opened from the account menu). */
export function ChangePasswordModal({
  open,
  onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: blank,
    mode: "onTouched",
  });

  useEffect(() => {
    if (open) reset(blank);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await changePassword(values);
      if (result.success) {
        toast.success(result.message);
        onClose();
        return;
      }
      let placed = false;
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        if (message && field in blank) {
          setError(field as keyof ChangePasswordValues, { type: "server", message });
          placed = true;
        }
      }
      if (!placed) setError("root.server", { type: "server", message: result.message });
    });
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
      title="Change Password"
      description="Use 8 to 72 characters."
      size="sm"
      dismissible={false}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {FIELDS.map(({ name, label, autoComplete }) => (
          <div key={name} className="space-y-1.5">
            <label htmlFor={`password-${name}`} className="text-sm font-medium">
              {label}
            </label>
            <input
              id={`password-${name}`}
              type="password"
              autoComplete={autoComplete}
              maxLength={72}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? `password-${name}-error` : undefined}
              className={inputClass(Boolean(errors[name]))}
              {...register(name)}
            />
            {errors[name]?.message && (
              <p id={`password-${name}-error`} className="text-xs text-red-600">
                {errors[name]?.message}
              </p>
            )}
          </div>
        ))}

        {errors.root?.server && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-800">
            {errors.root.server.message}
          </p>
        )}

        <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 rounded-md border border-neutral-400 bg-white px-4 text-sm hover:bg-neutral-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="h-9 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Change Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
