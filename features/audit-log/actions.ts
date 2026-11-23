"use server";

import { AUDIT_TABLES } from "@/features/audit-log/labels";
import { getRecordHistory, type AuditHistoryEntry } from "@/features/audit-log/queries";
import { requireUser } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";

/** Full audit history of one record, for the Record History modal. */
export async function loadRecordHistory(
  table: string,
  recordId: string,
): Promise<{ entries: AuditHistoryEntry[]; truncated: boolean } | { error: string }> {
  const user = await requireUser();
  if (!(await hasPermission(user.role, "audit", "read"))) {
    return { error: "You do not have access to the audit log." };
  }
  if (!(table in AUDIT_TABLES) || typeof recordId !== "string" || recordId.length > 200) {
    return { error: "Unknown record." };
  }
  return getRecordHistory(table, recordId);
}
