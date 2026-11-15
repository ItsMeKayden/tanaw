"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createUser } from "@/features/users-roles/actions/create-user";
import { createUserSchema, type CreateUserValues } from "@/features/users-roles/schemas";
import { ROLE_LABELS, ROLE_NAMES } from "@/lib/modules";

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 ${
    hasError ? "border-red-500 focus:ring-red-500/20" : "focus:border-[#191e73] focus:ring-[#191e73]/20"
  }`;

const defaultValues: CreateUserValues = { name: "", email: "", password: "", role: "ADMISSION" };

export function CreateUserForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
    mode: "onTouched",
  });

  function openModal() {
    setResult(null);
    reset(defaultValues);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    if (!isPending) dialogRef.current?.close();
  }

  const onSubmit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createUser(values);
      setResult({ success: response.success, message: response.message });
      if (response.success) {
        reset(defaultValues);
      } else if (response.fieldErrors) {
        for (const [field, message] of Object.entries(response.fieldErrors)) {
          if (message) setError(field as keyof CreateUserValues, { type: "server", message });
        }
      } else if (response.message.toLowerCase().includes("email")) {
        setError("email", { type: "server", message: response.message });
      }
    });
  });

  const fieldError = (field: keyof CreateUserValues) =>
    errors[field]?.message ? (
      <p id={`${field}-error`} className="text-xs text-red-600">
        {errors[field]?.message}
      </p>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-full bg-[#191e73] px-5 py-1.5 text-sm font-semibold text-white hover:bg-[#232a99]"
      >
        + Create User
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          if (isPending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeModal();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">Create User Account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add a new account and assign its system role.</p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={isPending}
            aria-label="Close modal"
            className="rounded-md px-3 py-1 text-xl text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              maxLength={150}
              placeholder="Enter full name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={inputClass(Boolean(errors.name))}
              {...register("name")}
            />
            {fieldError("name")}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              maxLength={150}
              placeholder="Enter email address"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={inputClass(Boolean(errors.email))}
              {...register("email")}
            />
            {fieldError("email")}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Temporary Password
            </label>
            <input
              id="password"
              type="password"
              maxLength={72}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={inputClass(Boolean(errors.password))}
              {...register("password")}
            />
            {fieldError("password")}
          </div>

          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Assigned Role
            </label>
            <select id="role" className={inputClass(Boolean(errors.role))} {...register("role")}>
              {ROLE_NAMES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {fieldError("role")}
          </div>

          {result && (
            <p role={result.success ? "status" : "alert"} className={`text-sm ${result.success ? "text-green-600" : "text-red-600"}`}>
              {result.message}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={closeModal}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#191e73] px-4 py-2 text-sm font-medium text-white hover:bg-[#232a99] disabled:opacity-50"
            >
              {isPending ? "Creating Account..." : "Create Account"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
