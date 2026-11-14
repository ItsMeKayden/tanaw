import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { buildMapDrawing, heatBins, mapLevelValues, ZERO_FILL } from "@/features/map/geo";
import { describeFilters, getMapOverview, resolveMapFilters } from "@/features/map/queries";
import { parseExportFormat, reportResponse, type Report } from "@/features/reports/report";
import { hasPermission } from "@/lib/permissions";

const ATTRIBUTION =
  "Boundaries: NAMRIA and PSA via OCHA COD-AB (CC BY-IGO). Basemap on screen: © OpenStreetMap contributors.";

/**
 * Map data export: ?format=csv|xlsx|pdf&level=district|barangay
 * and legend / counts / filters = 0 to leave those parts out.
 */
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

  const format = parseExportFormat(params.get("format"));
  const level = params.get("level") === "barangay" ? "barangay" : "district";
  const include = (key: string) => params.get(key) !== "0";
  const overview = await getMapOverview(filters);
  const bins = heatBins(Math.max(0, ...mapLevelValues(overview.districts, level)));

  const tables: Report["tables"] = [];
  if (include("counts")) {
    tables.push({
      title: "District counts",
      columns: [
        { key: "district", label: "District", width: 2 },
        { key: "applicants", label: "Applicants", align: "right" },
        { key: "passed", label: "Passed", align: "right" },
        { key: "share", label: "Share", align: "right" },
      ],
      rows: [
        ...overview.districts.map((d) => ({
          district: d.name,
          applicants: d.applicants,
          passed: d.admitted,
          share: overview.total ? `${Math.round((d.applicants / overview.total) * 1000) / 10}%` : "",
        })),
        {
          district: "Total",
          applicants: overview.total,
          passed: overview.districts.reduce((s, d) => s + d.admitted, 0),
          share: overview.total ? "100%" : "",
        },
      ],
    });
  }

  tables.push({
    title: "Barangay counts",
    columns: [
      { key: "district", label: "District", width: 1.2 },
      { key: "barangay", label: "Barangay", width: 2 },
      { key: "applicants", label: "Applicants", align: "right" },
      { key: "passed", label: "Passed", align: "right" },
    ],
    rows: overview.districts.flatMap((d) =>
      d.barangays
        .filter((b) => format !== "pdf" || b.applicants > 0) // PDF: only barangays with applicants
        .map((b) => ({ district: d.name, barangay: b.name, applicants: b.applicants, passed: b.admitted })),
    ),
  });

  tables.push({
    title: "Outside Quezon City (previous school city)",
    columns: [
      { key: "city", label: "City / Municipality", width: 2 },
      { key: "applicants", label: "Applicants", align: "right" },
      { key: "passed", label: "Passed", align: "right" },
    ],
    rows: overview.outside.map((row) => ({ city: row.city, applicants: row.applicants, passed: row.admitted })),
  });

  if (include("legend") && format !== "pdf") {
    tables.push({
      title: "Legend",
      columns: [
        { key: "range", label: "Applicants" },
        { key: "color", label: "Color" },
      ],
      rows: [...bins.map((b) => ({ range: b.label, color: b.color })), { range: "None", color: ZERO_FILL }],
    });
  }

  const report: Report = {
    title: `Quezon City applicants by ${level}`,
    meta: include("filters")
      ? [...describeFilters(filters), `Map level: ${level === "district" ? "Districts" : "Barangays"}`]
      : undefined,
    tables,
    map:
      format === "pdf" && overview.hasGeometry
        ? {
            drawing: buildMapDrawing(overview.districts, overview.cityOutline, level, bins, 640),
            legend: include("legend") ? bins : undefined,
            zeroFill: include("legend") ? ZERO_FILL : undefined,
          }
        : undefined,
    notes: [ATTRIBUTION],
    fileBase: `qc-applicant-map-${filters.cycle.school_year}-${new Date().toISOString().slice(0, 10)}`,
  };

  return reportResponse(report, format);
}
