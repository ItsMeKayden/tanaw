import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { tableStyles } from "@/components/ui/table-styles";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { BackLink } from "@/components/ui/back-link";
import { Pagination } from "@/components/ui/pagination";
import { ExportMenu } from "@/components/reports/export-menu";
import { ParamSelect } from "@/components/recommendation/controls";
import { stageBadgeClass } from "@/features/admission/stages";
import {
  APPLICANTS_PAGE_SIZE,
  filterQuery,
  getLocationApplicants,
  resolveMapFilters,
  STATUS_OPTIONS,
} from "@/features/map/queries";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { TablePageSkeleton } from "@/components/ui/skeletons";

type PageProps = Readonly<{
  searchParams: Promise<{
    cycle?: string;
    program?: string;
    status?: string;
    district?: string;
    barangay?: string;
    page?: string;
  }>;
}>;

const cell = tableStyles.td;

function positiveInt(value: string | undefined) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

async function LocationApplicantsContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("map", "read");

  const params = await searchParams;
  const filters = await resolveMapFilters(params);
  const barangayId = positiveInt(params.barangay);

  const barangay = barangayId
    ? await prisma.tbl_barangay.findUnique({
        where: { barangay_id: barangayId },
        select: { barangay_id: true, barangay_name: true, tbl_district: { select: { district_id: true, district_name: true } } },
      })
    : null;
  const districtId = barangay?.tbl_district?.district_id ?? positiveInt(params.district);
  const district = districtId
    ? await prisma.tbl_district.findUnique({
        where: { district_id: districtId },
        select: { district_id: true, district_name: true },
      })
    : null;

  const location = { districtId: district?.district_id, barangayId: barangay?.barangay_id };
  const requestedPage = positiveInt(params.page) ?? 1;
  const { total, rows } = filters.cycle
    ? await getLocationApplicants(filters, location, requestedPage)
    : { total: 0, rows: [] };
  const totalPages = Math.max(1, Math.ceil(total / APPLICANTS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const locationQuery = { district: district?.district_id, barangay: barangay?.barangay_id };
  const pageHref = (target: number) => `/map/applicants?${filterQuery(filters, { ...locationQuery, page: target })}`;
  const start = total === 0 ? 0 : (page - 1) * APPLICANTS_PAGE_SIZE + 1;

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />

      <BackLink href={`/map?${filterQuery(filters)}`}>Back to map</BackLink>

      <div>
        <h1 className="text-2xl font-bold">Applicant list per location</h1>
        <nav aria-label="Location" className="mt-1 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5 text-neutral-700">
            <li>
              <Link href={`/map?${filterQuery(filters)}`} className="hover:text-[#191e73] hover:underline">
                Map
              </Link>
            </li>
            <li aria-hidden="true">&gt;</li>
            <li>
              {district ? (
                <Link
                  href={`/map/applicants?${filterQuery(filters, { district: district.district_id })}`}
                  className={barangay ? "hover:text-[#191e73] hover:underline" : "font-semibold text-neutral-950"}
                  aria-current={barangay ? undefined : "page"}
                >
                  {district.district_name}
                </Link>
              ) : (
                <span className="font-semibold text-neutral-950" aria-current="page">
                  All of Quezon City
                </span>
              )}
            </li>
            {barangay && (
              <>
                <li aria-hidden="true">&gt;</li>
                <li className="font-semibold text-neutral-950" aria-current="page">
                  Brgy. {barangay.barangay_name}
                </li>
              </>
            )}
          </ol>
        </nav>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <ParamSelect
            param="program"
            label="Course"
            value={filters.program ? String(filters.program.program_id) : ""}
            options={[
              { value: "", label: "All" },
              ...filters.programs.map((p) => ({ value: String(p.program_id), label: p.program_code })),
            ]}
            resetParams={["page"]}
          />
          <ParamSelect param="status" label="Status" value={filters.status} options={STATUS_OPTIONS} resetParams={["page"]} />
        </div>
        <ExportMenu href={`/api/map/applicants/export?${filterQuery(filters, locationQuery)}`} />
      </div>

      <div className={tableStyles.wrap}>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className={tableStyles.headRow}>
              {["Applicant ID", "Name", "Previous school", "Preferred course", "Exam", "Result"].map((h) => (
                <th key={h} className={tableStyles.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={tableStyles.body}>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.application_no} className={tableStyles.row}>
                  <td className={`${cell} tabular-nums`}>
                    {row.applicant_id === null ? "--" : String(row.applicant_id).padStart(6, "0")}
                  </td>
                  <td className={cell}>
                    {row.applicant_id ? (
                      <Link href={`/admission/applicants/${row.applicant_id}`} className="font-medium text-[#191e73] hover:underline">
                        {row.full_name}
                      </Link>
                    ) : (
                      row.full_name
                    )}
                    {!barangay && row.barangay && (
                      <span className="block text-xs text-neutral-600">Brgy. {row.barangay}</span>
                    )}
                  </td>
                  <td className={cell}>
                    {row.school ?? "--"}
                    {row.school_city && <span className="block text-xs text-neutral-600">{row.school_city}</span>}
                  </td>
                  <td className={cell} title={row.program_name ?? undefined}>
                    {row.program_code ?? "--"}
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {row.exam === null ? "--" : `${row.exam}%`}
                    {row.exam_status && (
                      <span className={`ml-1 text-xs ${row.exam_status === "PASSED" ? "text-green-700" : "text-red-700"}`}>
                        {row.exam_status}
                      </span>
                    )}
                  </td>
                  <td className={cell}>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${stageBadgeClass(row.stage)}`}>
                      {row.stage ?? "--"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={tableStyles.empty}>
                  No applicants for this location and filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        start={start}
        end={Math.min(page * APPLICANTS_PAGE_SIZE, total)}
        total={total}
        noun="applicants"
        prevHref={page > 1 ? pageHref(page - 1) : null}
        nextHref={page < totalPages ? pageHref(page + 1) : null}
      />
    </div>
  );
}

export default function LocationApplicantsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<TablePageSkeleton label="applicant list" cols={7} />}>
      <LocationApplicantsContent searchParams={searchParams} />
    </Suspense>
  );
}
