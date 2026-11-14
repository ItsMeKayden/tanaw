"use client";

import { useRef, useState, useTransition } from "react";

import { createUser } from "@/features/users-roles/actions/create-user";

const roles = [
  "SYSTEM_ADMIN",
  "PRESIDENT",
  "ADMISSION",
  "REGISTRAR",
  "GUIDANCE",
] as const;

export function CreateUserForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function openModal() {
    setMessage("");
    setSuccess(false);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    if (!isPending) {
      dialogRef.current?.close();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setMessage("");

    startTransition(async () => {
      const result = await createUser(formData);

      setMessage(result.message);
      setSuccess(result.success);

      if (result.success) {
        form.reset();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        + Create User
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          if (isPending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            closeModal();
          }
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">Create User Account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a new account and assign its system role.
            </p>
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

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Enter full name"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Enter email address"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Temporary Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="At least 8 characters"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Assigned Role
            </label>
            <select
              id="role"
              name="role"
              required
              defaultValue="ADMISSION"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {message && (
            <p
              role="status"
              className={`text-sm ${
                success ? "text-green-600" : "text-destructive"
              }`}
            >
              {message}
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isPending ? "Creating Account..." : "Create Account"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
