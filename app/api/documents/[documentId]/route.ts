import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { ALLOWED_DOCUMENT_TYPES } from "@/features/admission/documents";
import { hasAnyPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Serves an uploaded application document. Only users who can read the
 * Admission or Registrar module may view documents.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/documents/[documentId]">,
) {
  const session = await auth();

  if (!session?.user?.role) {
    return new Response("Unauthorized", { status: 401 });
  }

  const allowed = await hasAnyPermission(
    session.user.role,
    ["admission", "registrar"],
    "read",
  );

  if (!allowed) {
    return new Response("Forbidden", { status: 403 });
  }

  const { documentId } = await ctx.params;
  const id = Number(documentId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const document = await prisma.tbl_application_document.findUnique({
    where: { document_id: id },
    select: { file_name: true, mime_type: true, file_data: true },
  });

  if (!document || !(document.mime_type in ALLOWED_DOCUMENT_TYPES)) {
    return new Response("Not found", { status: 404 });
  }

  const asciiName = document.file_name
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/"/g, "");

  return new Response(Buffer.from(document.file_data), {
    headers: {
      "Content-Type": document.mime_type,
      "Content-Length": String(document.file_data.byteLength),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
