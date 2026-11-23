import { auth } from "@/auth";
import { hasValidAuthCsrf, isSameOriginRequest } from "@/lib/api-security";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request) || !hasValidAuthCsrf(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user || !session.absoluteExpiresAt) {
    return Response.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  return Response.json(
    {
      userId: session.user.id,
      expiresAt: session.absoluteExpiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
