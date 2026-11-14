import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { describeFilters, getLocationApplicants, resolveMapFilters } from "@/features/map/queries";
import { parseExportFormat, reportResponse } from "@/features/reports/report";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const EXPORT_LIMIT = 10_000;

function positiveInt(value: string | null) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Applicant list of a district / barangay: ?format=csv|xlsx|pdf (all pages). */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasPermission(session.user.role, "map", "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const filters = await resolveMapFilters({
    cycle: params.get("cycle") ?? undefined,
    program: params.get("program") ?? undefined,
    status: params.get("status") ?? undefined,
  });
  if (!filters.cycle) return new Response("No admission cycle", { status: 404 });

  const districtId = positiveInt(params.get("district"));
  const barangayId = positiveInt(params.get("barangay"));
  const [district, barangay] = await Promise.all([
    districtId ? prisma.tbl_district.findUnique({ where: { district_id: districtId }, select: { district_name: true } }) : null,
    barangayId ? prisma.tbl_barangay.findUnique({ where: { barangay_id: barangayId }, select: { barangay_name: true } }) : null,
  ]);
  const location = barangay
    ? `Brgy. ${barangay.barangay_name}`
    : (district?.district_name ?? "All of Quezon City");

  const { rows, total } = await getLocationApplicants(filters, { districtId, barangayId }, 1, EXPORT_LIMIT);

  return reportResponse(
    {
      title: `Applicants – ${location}`,
      meta: [...describeFilters(filters), `${total} applicant${total === 1 ? "" : "s"}`],
      tables: [
        {
          title: "Applicants",
          columns: [
            { key: "id", label: "Applicant ID" },
            { key: "name", label: "Name", width: 2 },
            { key: "barangay", label: "Barangay", width: 1.3 },
            { key: "school", label: "Previous school", width: 2 },
            { key: "program", label: "Preferred course" },
            { key: "exam", label: "Exam %", align: "right" },
            { key: "stage", label: "Result", width: 1.3 },
          ],
          rows: rows.map((r) => ({
            id: r.applicant_id === null ? "" : String(r.applicant_id).padStart(6, "0"),
            name: r.full_name,
            barangay: r.barangay,
            school: r.school,
            program: r.program_code,
            exam: r.exam,
            stage: r.stage,
          })),
        },
      ],
      fileBase: `applicants-${location.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
    },
    parseExportFormat(params.get("format")),
  );
}
