"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Modal } from "@/components/ui/modal";
import { updateRoleDetails } from "@/features/user-management/actions/update-role-details";
import { roleDetailsSchema, type RoleDetailsValues } from "@/features/user-management/schemas";
import type { RoleName } from "@/lib/modules";
import { toast } from "@/components/ui/toaster";

export type RoleDetails = { role_name: RoleName; label: string; description: string | null };

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-500 focus:ring-red-500/20"
      : "border-neutral-500 focus:border-[#191e73] focus:ring-[#191e73]/20"
  }`;

export function RoleDetailsModal({
  role,
  onClose,
  onSaved,
}: Readonly<{
  /** null = closed. */
  role: RoleDetails | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RoleDetailsValues>({ resolver: zodResolver(roleDetailsSchema), mode: "onTouched" });

  useEffect(() => {
    if (role) reset({ role_name: role.role_name, display_name: role.label, description: role.description ?? "" });
  }, [role, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateRoleDetails(values);
      if (result.success) {
        onSaved(result.message);
        return;
      }
      const fieldError = result.fieldErrors?.display_name ?? result.fieldErrors?.description;
      if (result.fieldErrors?.display_name) setError("display_name", { type: "server", message: fieldError });
      else if (result.fieldErrors?.description) setError("description", { type: "server", message: fieldError });
      else setError("root.server", { type: "server", message: result.message });
      toast.error(result.message);
    });
  });

  return (
    <Modal
      open={role !== null}
      onOpenChange={(open) => !open && !isPending && onClose()}
      title="Edit Role"
      description={role ? `Role code: ${role.role_name}` : undefined}
      size="sm"
      dismissible={false}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="role-display-name" className="text-sm font-medium">
            Role Name
          </label>
          <input
            id="role-display-name"
            type="text"
            maxLength={100}
            aria-invalid={Boolean(errors.display_name)}
            className={inputClass(Boolean(errors.display_name))}
            {...register("display_name")}
          />
          {errors.display_name && <p className="text-xs text-red-600">{errors.display_name.message}</p>}
          <p className="text-xs text-neutral-600">
            Shown in the header, account list, and role pickers. Access checks use the role code, which
            doesn&apos;t change.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="role-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="role-description"
            rows={3}
            maxLength={300}
            placeholder="What this role is responsible for"
            aria-invalid={Boolean(errors.description)}
            className={inputClass(Boolean(errors.description))}
            {...register("description")}
          />
          {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
        </div>

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
            {isPending ? "Saving…" : "Save Role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
