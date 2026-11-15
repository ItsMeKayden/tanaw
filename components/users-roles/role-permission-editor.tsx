"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { updateRolePermissions } from "@/features/users-roles/actions/update-role-permissions";
import {
  rolePermissionsFormSchema,
  type AccessLevel,
  type RolePermissionsFormValues,
} from "@/features/users-roles/schemas";
import { MODULES, ROLE_LABELS, type ModuleCode, type RoleName } from "@/lib/modules";

type Matrix = Record<string, Record<ModuleCode, AccessLevel>>;

const LEVEL_LABEL: Record<AccessLevel, string> = {
  NONE: "No access",
  READ: "Read",
  WRITE: "Read & Write",
};

const LEVEL_CLASS: Record<AccessLevel, string> = {
  NONE: "text-neutral-500",
  READ: "text-[#2a5bb8] font-medium",
  WRITE: "text-green-700 font-semibold",
};

const cell = "border border-neutral-500 px-2 py-2";

export default function RolePermissionEditor({
  roles,
  initial,
  canEdit,
  currentRole,
}: Readonly<{
  roles: { role_name: RoleName; description: string | null; accounts: number }[];
  initial: Matrix;
  canEdit: boolean;
  currentRole: string;
}>) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const { register, control, handleSubmit, reset } = useForm<RolePermissionsFormValues>({
    resolver: zodResolver(rolePermissionsFormSchema),
    defaultValues: { roles: initial },
  });
  const matrix = { ...initial, ...useWatch({ control, name: "roles" }) } as Matrix;

  // After a save the server sends fresh permissions; reset the form to them.
  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (syncedInitial !== initial) {
    setSyncedInitial(initial);
    reset({ roles: initial });
  }

  const changedRoles = roles.filter(
    (role) => JSON.stringify(matrix[role.role_name]) !== JSON.stringify(initial[role.role_name]),
  );

  const save = handleSubmit((values) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateRolePermissions(
        changedRoles.map((role) => ({
          role_name: role.role_name,
          access: values.roles[role.role_name] as Record<ModuleCode, AccessLevel>,
        })),
      );
      setFeedback("error" in result ? { ok: false, text: result.error } : { ok: true, text: result.message });
      router.refresh();
    });
  });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse bg-white/90 text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={`${cell} sticky left-0 z-10 min-w-48 bg-neutral-100 font-medium`}>Role</th>
              {MODULES.map((m) => (
                <th key={m.code} className={`${cell} text-center font-medium`}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const locked = role.role_name === "SYSTEM_ADMIN";
              const changed = changedRoles.some((r) => r.role_name === role.role_name);
              return (
                <tr key={role.role_name} className={changed ? "bg-amber-50" : ""}>
                  <th scope="row" className={`${cell} sticky left-0 z-10 bg-white text-left font-normal`}>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {ROLE_LABELS[role.role_name]}
                      {locked && <Lock className="size-3.5 text-neutral-500" aria-label="Locked" />}
                    </span>
                    <span className="block text-xs text-neutral-600">
                      {role.accounts} account{role.accounts === 1 ? "" : "s"}
                      {role.description ? ` · ${role.description}` : ""}
                    </span>
                  </th>
                  {MODULES.map((m) => {
                    const level = matrix[role.role_name]?.[m.code] ?? "NONE";
                    const ownUsersCell = role.role_name === currentRole && m.code === "USERS";
                    const editable = canEdit && !locked && !ownUsersCell;
                    return (
                      <td key={m.code} className={`${cell} text-center`}>
                        {editable ? (
                          <select
                            {...register(`roles.${role.role_name}.${m.code}`)}
                            disabled={isPending}
                            aria-label={`${ROLE_LABELS[role.role_name]} – ${m.label}`}
                            className={`h-8 rounded-md border border-neutral-400 bg-white px-1.5 text-xs ${LEVEL_CLASS[level]}`}
                          >
                            {(Object.keys(LEVEL_LABEL) as AccessLevel[]).map((value) => (
                              <option key={value} value={value}>
                                {LEVEL_LABEL[value]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`text-xs ${LEVEL_CLASS[level]}`}
                            title={ownUsersCell ? "You can't change your own role's access to this page." : undefined}
                          >
                            {LEVEL_LABEL[level]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-600">
          &ldquo;Read &amp; Write&rdquo; includes read access. System Admin always has full access.
          {canEdit ? "" : " You have view-only access."}
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                reset({ roles: initial });
                setFeedback(null);
              }}
              disabled={isPending || changedRoles.length === 0}
              className="rounded-full border border-neutral-500 bg-white px-4 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending || changedRoles.length === 0}
              className="rounded-full bg-[#191e73] px-5 py-1.5 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-50"
            >
              {isPending
                ? "Saving..."
                : `Save changes${changedRoles.length > 0 ? ` (${changedRoles.length})` : ""}`}
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-lg border p-3 text-sm ${
            feedback.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
