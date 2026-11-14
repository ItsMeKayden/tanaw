import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { getAdmittedApplications } from "@/features/admission/enrollment-queries";
import { parseExportFormat, reportResponse } from "@/features/reports/report";
import { hasAnyPermission } from "@/lib/permissions";

/**
 * "Verify with Registrar": admitted applicants whose enrollment is still
 * pending, for the Registrar to cross-check. ?format=xlsx (default) | csv | pdf
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });

  const allowed = await hasAnyPermission(session.user.role, ["admission", "registrar"], "read");
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const pending = (await getAdmittedApplications()).filter((row) => row.status === "PENDING");
  const date = new Date().toISOString().slice(0, 10);

  return reportResponse(
    {
      title: "Pending enrollment – for Registrar verification",
      meta: [`${pending.length} passed applicant${pending.length === 1 ? "" : "s"} awaiting verification`, `Generated ${date}`],
      tables: [
        {
          title: "Pending enrollment",
          columns: [
            { key: "id", label: "Applicant ID" },
            { key: "applicationNo", label: "Application No.", width: 1.3 },
            { key: "name", label: "Name", width: 2 },
            { key: "course", label: "Course" },
            { key: "campus", label: "Campus", width: 1.5 },
            { key: "score", label: "Exam score", align: "right" },
            { key: "percent", label: "Exam %", align: "right" },
            { key: "email", label: "Email", width: 2 },
            { key: "mobile", label: "Mobile", width: 1.2 },
          ],
          rows: pending.map((row) => ({
            id: row.applicant_id === null ? "" : String(row.applicant_id).padStart(6, "0"),
            applicationNo: row.application_no,
            name: row.full_name,
            course: row.program_code,
            campus: row.branch_name,
            score: row.raw_score === null ? "" : `${row.raw_score}${row.max_score ? `/${row.max_score}` : ""}`,
            percent: row.exam_percentage,
            email: row.email,
            mobile: row.mobile_no,
          })),
        },
      ],
      fileBase: `pending-enrollment-${date}`,
    },
    parseExportFormat(request.nextUrl.searchParams.get("format"), "xlsx"),
  );
}
