import { auth } from "@/auth";
import { APPLICANT_EDIT_MODULES } from "@/features/admission/access";
import { createApplicantForUser } from "@/features/admission/services/create-applicant";
import { updateApplicantForUser } from "@/features/admission/services/update-applicant";
import { hasAnyPermission } from "@/lib/permissions";
import { hasValidAuthCsrf, isSameOriginRequest } from "@/lib/api-security";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request) || !hasValidAuthCsrf(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }
  if (!(await hasAnyPermission(session.user.role, APPLICANT_EDIT_MODULES, "write"))) {
    return Response.json({ error: "You do not have permission to edit applicants." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid applicant form submission." }, { status: 400 });
  }

  const result = formData.has("applicant_id")
    ? await updateApplicantForUser(formData, session.user)
    : await createApplicantForUser(formData, session.user);
  return Response.json(result, { status: "error" in result ? 422 : 200 });
}
