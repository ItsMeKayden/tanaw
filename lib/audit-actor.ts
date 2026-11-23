import { cache } from "react";
import { unstable_rethrow } from "next/navigation";

/** Who is making a change, as recorded in tbl_audit_log. */
export type AuditActor = {
  id: number | null;
  name: string | null;
  email: string | null;
  role: string | null;
  userAgent: string | null;
};

/** Browser of the current request (null outside a request). */
export const getRequestMeta = cache(async (): Promise<Pick<AuditActor, "userAgent">> => {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return { userAgent: h.get("user-agent")?.slice(0, 1000) || null };
  } catch (error) {
    unstable_rethrow(error);
    return { userAgent: null };
  }
});

/**
 * The signed-in user making the current request, or null when there is no
 * request or no session (seeds, scripts, background work) — the audit log
 * then shows "System". Cached per request.
 */
export const getAuditActor = cache(async (): Promise<AuditActor | null> => {
  try {
    // Imported lazily: auth.ts imports lib/prisma, which imports this file.
    const { auth } = await import("@/auth");
    const session = await auth();
    if (!session?.user) return null;

    const id = Number(session.user.id);
    return {
      id: Number.isSafeInteger(id) && id > 0 ? id : null,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      role: session.user.role ?? null,
      ...(await getRequestMeta()),
    };
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
});
