import { auth } from "@/auth";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import {
  getDraftStepName,
  sanitizeDraftValues,
} from "@/features/admission/draft-data";
import { hasAnyPermission } from "@/lib/permissions";
import { hasValidAuthCsrf, isSameOriginRequest } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

type DraftRequest = {
  operation?: unknown;
  stepId?: unknown;
  values?: unknown;
  lastUpdated?: unknown;
};

function draftResponse(
  data: unknown,
  updatedAt: Date,
) {
  return {
    values: data,
    lastUpdated: updatedAt.getTime(),
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request) || !hasValidAuthCsrf(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }
  if (!(await hasAnyPermission(session.user.role, APPLICANT_EDIT_MODULES, "write"))) {
    return Response.json({ error: "You do not have permission to manage admission drafts." }, { status: 403 });
  }

  let input: DraftRequest;
  try {
    input = await request.json() as DraftRequest;
  } catch {
    return Response.json({ error: "Invalid draft request." }, { status: 400 });
  }

  if (typeof input.stepId !== "string" || !getDraftStepName(input.stepId)) {
    return Response.json({ error: "Invalid draft step." }, { status: 400 });
  }

  const userId = Number(session.user.id);
  const stepId = input.stepId;

  if (input.operation === "load") {
    const record = await prisma.tbl_admission_draft.findFirst({
      where: { user_id: userId, step_id: stepId, status: "DRAFT" },
      select: { data: true, updated_at: true },
    });
    if (!record) return Response.json({ draft: null }, { headers: { "Cache-Control": "no-store" } });

    const values = sanitizeDraftValues(stepId, record.data);
    if (!values) {
      return Response.json({ error: "The saved draft has an invalid format." }, { status: 500 });
    }
    return Response.json(
      { draft: draftResponse(values, record.updated_at) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (input.operation === "delete") {
    await prisma.tbl_admission_draft.deleteMany({
      where: { user_id: userId, step_id: stepId },
    });
    return Response.json({ deleted: true });
  }

  const values = sanitizeDraftValues(stepId, input.values);
  if (!values || Object.keys(values).length === 0) {
    return Response.json({ error: "Draft values are invalid or empty." }, { status: 400 });
  }

  if (input.operation === "sync") {
    if (
      typeof input.lastUpdated !== "number" ||
      !Number.isFinite(input.lastUpdated) ||
      input.lastUpdated <= 0 ||
      input.lastUpdated > Date.now() + 5 * 60 * 1000
    ) {
      return Response.json({ error: "Invalid draft timestamp." }, { status: 400 });
    }

    const existing = await prisma.tbl_admission_draft.findFirst({
      where: { user_id: userId, step_id: stepId, status: "DRAFT" },
      select: { data: true, updated_at: true },
    });
    if (existing && existing.updated_at.getTime() >= input.lastUpdated) {
      const currentValues = sanitizeDraftValues(stepId, existing.data);
      if (!currentValues) {
        return Response.json({ error: "The saved draft has an invalid format." }, { status: 500 });
      }
      return Response.json(
        { draft: draftResponse(currentValues, existing.updated_at), source: "server" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  if (input.operation !== "save" && input.operation !== "sync") {
    return Response.json({ error: "Unknown draft operation." }, { status: 400 });
  }

  const now = new Date();
  const record = await prisma.tbl_admission_draft.upsert({
    where: { user_id_step_id: { user_id: userId, step_id: stepId } },
    create: {
      user_id: userId,
      step_id: stepId,
      status: "DRAFT",
      data: values,
      updated_at: now,
    },
    update: { status: "DRAFT", data: values, updated_at: now },
    select: { data: true, updated_at: true },
  });
  return Response.json(
    { draft: draftResponse(record.data, record.updated_at), source: "server" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
