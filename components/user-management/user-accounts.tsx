"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";
import { UserFormModal, type EditableUser, type UserFormRequest } from "@/components/user-management/user-form-modal";
import { changeUserRole } from "@/features/user-management/actions/update-user";
import { ROLE_NAMES, type RoleName } from "@/lib/modules";
import { toast } from "@/components/ui/toaster";

export type AccountRow = EditableUser & { created_at: string | null };

const PAGE_SIZE = 10;

const cell = tableStyles.td;
const fieldClass =
  "h-9 w-full rounded-md border border-neutral-500 bg-white px-3 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

const ROLE_BADGE: Record<string, string> = {
  SYSTEM_ADMIN: "bg-[#191e73] text-white",
  PRESIDENT: "bg-neutral-700 text-white",
  ADMISSION: "bg-[#2a78d6] text-white",
  REGISTRAR: "bg-[#e3e4f8] text-[#191e73]",
  GUIDANCE: "bg-green-600 text-white",
};

export function UserAccounts({
  accounts,
  canWrite,
  currentUserId,
  currentRole,
  roleLabels,
}: Readonly<{
  accounts: AccountRow[];
  canWrite: boolean;
  currentUserId: number;
  currentRole: string;
  roleLabels: Record<RoleName, string>;
}>) {
  const router = useRouter();
  const [request, setRequest] = useState<UserFormRequest>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [roleChange, setRoleChange] = useState<{ user: AccountRow; role: RoleName; error: string | null } | null>(null);
  const [isChanging, startChange] = useTransition();

  const query = searchQuery.trim().toLowerCase();
  const filtered = accounts.filter((user) => {
    const matchesSearch =
      !query || user.full_name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "ALL" || (statusFilter === "ACTIVE" ? user.is_active : !user.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  // Only System Admins can edit System Admin accounts.
  const canEdit = (user: AccountRow) =>
    canWrite && (currentRole === "SYSTEM_ADMIN" || user.role !== "SYSTEM_ADMIN");

  const resetPage = () => setCurrentPage(1);

  // Roles the current user may assign (only System Admins can grant System Admin).
  const assignableRoles = ROLE_NAMES.filter((role) => currentRole === "SYSTEM_ADMIN" || role !== "SYSTEM_ADMIN");

  function saveRoleChange() {
    if (!roleChange) return;
    const { user, role } = roleChange;
    startChange(async () => {
      const result = await changeUserRole({ userId: user.user_id, role });
      if (!result.success) {
        setRoleChange({ user, role, error: result.message });
        toast.error(result.message);
        return;
      }
      setRoleChange(null);
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid w-full grid-cols-1 gap-3 sm:flex sm:flex-1 sm:items-end">
          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-xs">
            Search accounts
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                resetPage();
              }}
              placeholder="Name or email…"
              className={`${fieldClass} font-normal`}
            />
          </label>
          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-44">
            Role
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                resetPage();
              }}
              className={`${fieldClass} font-normal`}
            >
              <option value="ALL">All roles</option>
              {ROLE_NAMES.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-36">
            Status
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                resetPage();
              }}
              className={`${fieldClass} font-normal`}
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setRequest({ mode: "create" });
            }}
            className="inline-flex h-9 w-full shrink-0 items-center justify-center rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] sm:w-40"
          >
            + Create User
          </button>
        )}
      </div>


      <div className={tableStyles.wrap}>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className={tableStyles.headRow}>
              {["Account", "Role", "Status", "Created", ...(canWrite ? ["Actions"] : [])].map((h) => (
                <th key={h} className={tableStyles.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={tableStyles.body}>
            {visible.length > 0 ? (
              visible.map((user) => (
                <tr key={user.user_id} className={tableStyles.row}>
                  <td className={cell}>
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e3e4f8] text-sm font-semibold text-[#191e73]"
                      >
                        {user.full_name.charAt(0).toUpperCase()}
                      </span>
                      <span>
                        <span className="block font-medium">
                          {user.full_name}
                          {user.user_id === currentUserId && (
                            <span className="ml-1.5 text-xs font-normal text-neutral-600">(you)</span>
                          )}
                        </span>
                        <span className="block text-xs text-neutral-600">{user.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className={cell}>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role ?? ""] ?? "bg-neutral-200"}`}
                    >
                      {user.role ? roleLabels[user.role] : "Unassigned"}
                    </span>
                  </td>
                  <td className={cell}>
                    {user.is_active ? (
                      <span className="text-green-700">● Active</span>
                    ) : (
                      <span className="text-neutral-500">○ Inactive</span>
                    )}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("en-PH") : "--"}
                  </td>
                  {canWrite && (
                    <td className={cell}>
                      {canEdit(user) ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRequest({ mode: "edit", user });
                            }}
                            className={tableStyles.action}
                          >
                            Edit
                          </button>
                          {user.user_id !== currentUserId && (
                            <button
                              type="button"
                              onClick={() => {
                                setRoleChange({ user, role: user.role ?? "ADMISSION", error: null });
                              }}
                              className="rounded-md border border-[#191e73]/60 bg-white inline-flex h-7 items-center px-2.5 text-xs font-medium text-[#191e73] hover:bg-[#e3e4f8]"
                            >
                              Change role
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-500">System Admin only</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className={tableStyles.empty}>
                  {accounts.length === 0 ? "No registered users found." : "No accounts match your search or filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        start={filtered.length === 0 ? 0 : startIndex + 1}
        end={Math.min(startIndex + PAGE_SIZE, filtered.length)}
        total={filtered.length}
        noun="accounts"
        onPageChange={setCurrentPage}
      />

      {canWrite && (
        <UserFormModal
          request={request}
          currentUserId={currentUserId}
          currentRole={currentRole}
          roleLabels={roleLabels}
          onClose={() => setRequest(null)}
          onSaved={(message) => {
            setRequest(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}

      <Modal
        open={roleChange !== null}
        onOpenChange={(open) => !open && !isChanging && setRoleChange(null)}
        title="Change Role"
        description={roleChange ? `${roleChange.user.full_name} · ${roleChange.user.email}` : undefined}
        size="sm"
      >
        {roleChange && (
          <div className="space-y-4 text-sm">
            <label className="flex flex-col gap-1.5 font-medium">
              New role
              <select
                value={roleChange.role}
                onChange={(event) =>
                  setRoleChange({ ...roleChange, role: event.target.value as RoleName, error: null })
                }
                className={`${fieldClass} font-normal`}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                    {role === roleChange.user.role ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-neutral-600">
              The account gets the new role&apos;s module access the next time they sign in.
            </p>
            {roleChange.error && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2.5 text-red-800">
                {roleChange.error}
              </p>
            )}
            <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setRoleChange(null)}
                disabled={isChanging}
                className="h-9 rounded-md border border-neutral-400 bg-white px-4 hover:bg-neutral-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRoleChange}
                disabled={isChanging || roleChange.role === roleChange.user.role}
                className="h-9 rounded-md bg-[#191e73] px-4 font-semibold text-white hover:bg-[#232a99] disabled:opacity-60"
              >
                {isChanging ? "Saving…" : "Change Role"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
