"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Modal } from "@/components/ui/modal";
import { createUser } from "@/features/user-management/actions/create-user";
import { updateUser } from "@/features/user-management/actions/update-user";
import {
  createUserSchema,
  updateUserFormSchema,
  type CreateUserValues,
} from "@/features/user-management/schemas";
import { ROLE_NAMES, type RoleName } from "@/lib/modules";
import { toast } from "@/components/ui/toaster";

export type EditableUser = {
  user_id: number;
  full_name: string;
  email: string;
  role: RoleName | null;
  is_active: boolean;
};

/** null = closed; "create" = new account; a user = edit that account. */
export type UserFormRequest = { mode: "create" } | { mode: "edit"; user: EditableUser } | null;

type FormValues = CreateUserValues;

const inputClass = (hasError: boolean) =>
  `h-9 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-500 focus:ring-red-500/20"
      : "border-neutral-500 focus:border-[#191e73] focus:ring-[#191e73]/20"
  }`;

const blank: FormValues = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "ADMISSION",
  isActive: true,
};

function valuesFor(request: UserFormRequest): FormValues {
  if (request?.mode !== "edit") return blank;
  const { user } = request;
  return {
    name: user.full_name,
    email: user.email,
    password: "",
    confirmPassword: "",
    role: user.role ?? "ADMISSION",
    isActive: user.is_active,
  };
}

export function UserFormModal({
  request,
  currentUserId,
  currentRole,
  roleLabels,
  onClose,
  onSaved,
}: Readonly<{
  request: UserFormRequest;
  currentUserId: number;
  currentRole: string;
  roleLabels: Record<RoleName, string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [isPending, startTransition] = useTransition();

  const editing = request?.mode === "edit" ? request.user : null;
  const isSelf = editing?.user_id === currentUserId;
  const canGrantAdmin = currentRole === "SYSTEM_ADMIN";
  const submitLabel = editing ? "Save Changes" : "Create Account";

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    // Edit mode allows a blank password (keeps the current one).
    resolver: zodResolver(editing ? updateUserFormSchema : createUserSchema),
    defaultValues: blank,
    mode: "onTouched",
  });

  useEffect(() => {
    // reset() also clears the previous server error (errors.root).
    if (request) reset(valuesFor(request));
  }, [request, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const response = editing
        ? await updateUser({ ...values, userId: editing.user_id })
        : await createUser(values);
      if (response.success) {
        onSaved(response.message);
        return;
      }
      let placed = false;
      for (const [field, message] of Object.entries(response.fieldErrors ?? {})) {
        if (message && field in blank) {
          setError(field as keyof FormValues, { type: "server", message });
          placed = true;
        }
      }
      if (!placed) setError("root.server", { type: "server", message: response.message });
      toast.error(response.message);
    });
  });

  const fieldError = (field: keyof FormValues) =>
    errors[field]?.message ? (
      <p id={`user-${field}-error`} className="text-xs text-red-600">
        {errors[field]?.message}
      </p>
    ) : null;

  const field = (name: keyof FormValues) => ({
    id: `user-${name}`,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `user-${name}-error` : undefined,
  });

  const roleOptions = ROLE_NAMES.filter(
    (role) => canGrantAdmin || role !== "SYSTEM_ADMIN" || editing?.role === "SYSTEM_ADMIN",
  );

  return (
    <Modal
      open={request !== null}
      onOpenChange={(open) => !open && !isPending && onClose()}
      title={editing ? "Edit User Account" : "Create User Account"}
      description={editing ? editing.email : "Add a new account and assign its system role."}
      size="sm"
      dismissible={false}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="user-name" className="text-sm font-medium">
            Full Name
          </label>
          <input
            type="text"
            maxLength={150}
            placeholder="Enter full name"
            className={inputClass(Boolean(errors.name))}
            {...field("name")}
            {...register("name")}
          />
          {fieldError("name")}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="user-email" className="text-sm font-medium">
            Email Address <span className="font-normal text-neutral-600">(used to sign in)</span>
          </label>
          <input
            type="email"
            maxLength={150}
            placeholder="name@qcu.edu.ph"
            autoComplete="off"
            className={inputClass(Boolean(errors.email))}
            {...field("email")}
            {...register("email")}
          />
          {fieldError("email")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="user-password" className="text-sm font-medium">
              {editing ? "New Password" : "Temporary Password"}
            </label>
            <input
              type="password"
              maxLength={72}
              placeholder={editing ? "Leave blank to keep" : "At least 8 characters"}
              autoComplete="new-password"
              className={inputClass(Boolean(errors.password))}
              {...field("password")}
              {...register("password")}
            />
            {fieldError("password")}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="user-confirmPassword" className="text-sm font-medium">
              Confirm Password
            </label>
            <input
              type="password"
              maxLength={72}
              placeholder="Re-enter password"
              autoComplete="new-password"
              className={inputClass(Boolean(errors.confirmPassword))}
              {...field("confirmPassword")}
              {...register("confirmPassword")}
            />
            {fieldError("confirmPassword")}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="user-role" className="text-sm font-medium">
            Assigned Role
          </label>
          {/* Your own role and status are fixed (changing them would lock you out); the
              values still come from the form's reset values. */}
          {isSelf && editing ? (
            <p id="user-role" className="flex h-9 items-center rounded-md border border-neutral-300 bg-neutral-100 px-3 text-sm">
              {editing.role ? roleLabels[editing.role] : "Unassigned"}
              <span className="ml-auto text-xs text-neutral-600">Your own role can&apos;t be changed</span>
            </p>
          ) : (
            <select className={inputClass(Boolean(errors.role))} {...field("role")} {...register("role")}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          )}
          {fieldError("role")}
        </div>

        {!isSelf && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[#191e73]" {...register("isActive")} />
            <span>
              <span className="font-medium">Active account</span>
              <span className="block text-xs text-neutral-600">Inactive accounts can&apos;t sign in.</span>
            </span>
          </label>
        )}
        {fieldError("isActive")}

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
            {isPending ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
