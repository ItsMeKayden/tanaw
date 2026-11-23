import { getRequestMeta } from "@/lib/audit-actor";
import { prisma } from "@/lib/prisma";

/** Audit entries written by the app (row changes are logged by database triggers). */
export type AuditEventAction = "LOGIN" | "LOGIN_FAILED" | "LOGOUT";

/**
 * Records an event that is not a row change, e.g. a sign-in. Never throws:
 * a logging failure must not block the action being logged.
 */
export async function recordAuditEvent(event: {
  action: AuditEventAction;
  description: string;
  actor?: { id?: number | string | null; name?: string | null; email?: string | null; role?: string | null };
}) {
  try {
    const actorId = Number(event.actor?.id);
    const { userAgent } = await getRequestMeta();

    await prisma.tbl_audit_log.create({
      data: {
        action: event.action,
        description: event.description,
        actor_id: Number.isSafeInteger(actorId) && actorId > 0 ? actorId : null,
        actor_name: event.actor?.name ?? null,
        actor_email: event.actor?.email ?? null,
        actor_role: event.actor?.role ?? null,
        user_agent: userAgent,
      },
    });
  } catch (error) {
    console.error("Could not write audit event:", error);
  }
}
