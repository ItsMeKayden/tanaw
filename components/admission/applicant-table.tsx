"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApplicantFormModal, type ApplicantFormRequest } from "@/components/admission/applicant-form-modal";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";
import { archiveApplicant } from "@/features/admission/actions/archive-applicant";
import type { ApplicantFormReference } from "@/features/admission/actions/load-applicant";
import { ADMISSION_STAGE_ORDER, stageBadgeClass } from "@/features/admission/stages";
import { toast } from "@/components/ui/toaster";

export type ApplicantRow = {
  applicant_id: number;
  application_no: string | null;
  name: string;
  course_code: string | null;
  course_name: string | null;
  school_name: string | null;
  school_type: string | null;
  stage: string | null;
};

type Feedback = { type: "success" | "error"; text: string; applicantId?: number; archived?: boolean } | null;
type ArchiveState = { row: ApplicantRow; error: string | null } | null;

const PAGE_SIZE = 10;

const th = tableStyles.th;
const td = tableStyles.td;
const fieldClass =
  "h-9 w-full rounded-md border border-neutral-500 bg-white px-3 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";
const actionButton = tableStyles.action;

const applicantId = (row: ApplicantRow) => row.application_no ?? String(row.applicant_id).padStart(6, "0");

export default function ApplicantTable({
  applicants,
  canEdit,
  canArchive,
  profileBase,
  formData,
}: Readonly<{
  applicants: ApplicantRow[];
  /** Add and edit applicants. */
  canEdit: boolean;
  /** Archive applicants (Admission only). */
  canArchive: boolean;
  /** Profile route base of the current module, e.g. /registrar/applicants. */
  profileBase: string;
  /** Dropdown data for the add/edit modal (null when the user can't write). */
  formData: ApplicantFormReference | null;
}>) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [formRequest, setFormRequest] = useState<ApplicantFormRequest | null>(null);
  const [archiving, setArchiving] = useState<ArchiveState>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const query = searchQuery.trim().toLowerCase();
  const filteredApplicants = applicants.filter((row) => {
    const matchesSearch =
      !query ||
      [applicantId(row), row.name, row.course_code, row.course_name, row.school_name, row.school_type]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    const matchesStage = stageFilter === "ALL" || row.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const totalPages = Math.max(1, Math.ceil(filteredApplicants.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const currentApplicants = filteredApplicants.slice(startIndex, startIndex + PAGE_SIZE);
  const startRecord = filteredApplicants.length === 0 ? 0 : startIndex + 1;
  const endRecord = Math.min(startIndex + PAGE_SIZE, filteredApplicants.length);

  function openForm(request: ApplicantFormRequest) {
    setFeedback(null);
    setFormRequest(request);
  }

  function confirmArchive(row: ApplicantRow) {
    startTransition(async () => {
      const result = await archiveApplicant(row.applicant_id);
      if ("error" in result) {
        setArchiving({ row, error: result.error });
        toast.error(result.error);
        return;
      }
      setArchiving(null);
      toast.success(`${row.name} was moved to the archive.`);
      setFeedback({ type: "success", text: `${row.name} was moved to the archive.`, archived: true });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Search, status filter, and Add Applicant */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid w-full grid-cols-1 gap-3 sm:flex sm:flex-1 sm:items-end">
          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-sm">
            Search applicants
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="ID, name, course, or school…"
              className={`${fieldClass} font-normal`}
            />
          </label>

          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-52">
            Status
            <select
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value);
                setCurrentPage(1);
              }}
              className={`${fieldClass} font-normal`}
            >
              <option value="ALL">All statuses</option>
              {ADMISSION_STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canEdit && formData && (
          <button
            type="button"
            onClick={() => openForm({ mode: "create" })}
            className="inline-flex h-9 w-full shrink-0 items-center justify-center rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] sm:w-40"
          >
            + Add Applicant
          </button>
        )}
      </div>

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-md border p-2.5 text-sm ${
            feedback.type === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.text}
          {feedback.applicantId && (
            <>
              {" "}
              <Link href={`${profileBase}/${feedback.applicantId}`} className="font-medium underline">
                View profile
              </Link>
            </>
          )}
          {feedback.archived && (
            <>
              {" "}
              <Link href="/admission/archive" className="font-medium underline">
                Open Archive History
              </Link>
            </>
          )}
        </p>
      )}

      {/* Applicant table */}
      <div className={tableStyles.wrap}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={tableStyles.headRow}>
              <th className={th}>Applicant ID</th>
              <th className={th}>Name</th>
              <th className={th}>Preferred Course</th>
              <th className={th}>Previous School</th>
              <th className={th}>Type</th>
              <th className={th}>Status</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>

          <tbody className={tableStyles.body}>
            {currentApplicants.length > 0 ? (
              currentApplicants.map((row) => (
                <tr key={row.applicant_id} className={tableStyles.row}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{applicantId(row)}</td>
                  <td className={td}>{row.name}</td>
                  <td className={td} title={row.course_name ?? undefined}>
                    {row.course_code ?? "--"}
                  </td>
                  <td className={td}>{row.school_name ?? "--"}</td>
                  <td className={td}>{row.school_type ?? "--"}</td>
                  <td className={td}>
                    {row.stage ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${stageBadgeClass(
                          row.stage,
                        )}`}
                      >
                        {row.stage}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      <Link href={`${profileBase}/${row.applicant_id}`} className={actionButton}>
                        View
                      </Link>
                      {canEdit && formData && row.application_no && (
                        <button
                          type="button"
                          onClick={() =>
                            openForm({
                              mode: "edit",
                              applicantId: row.applicant_id,
                              subtitle: `${row.name} · ${applicantId(row)}`,
                            })
                          }
                          className={actionButton}
                        >
                          Edit
                        </button>
                      )}
                      {canArchive && (
                        <button
                          type="button"
                          onClick={() => {
                            setFeedback(null);
                            setArchiving({ row, error: null });
                          }}
                          className="rounded-md border border-amber-400 bg-white inline-flex h-7 items-center px-2.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className={tableStyles.empty}>
                  {query || stageFilter !== "ALL" ? "No applicants match your search or filter." : "No applicants found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        start={startRecord}
        end={endRecord}
        total={filteredApplicants.length}
        noun="applicants"
        onPageChange={setCurrentPage}
      />

      {/* Add / edit applicant */}
      {formData && (
        <ApplicantFormModal
          request={formRequest}
          reference={formData}
          onClose={() => setFormRequest(null)}
          onSaved={(id, mode) => {
            setFormRequest(null);
            toast.success(mode === "create" ? "Applicant added." : "Applicant updated.");
            setFeedback({
              type: "success",
              text: mode === "create" ? "Applicant added." : "Applicant updated.",
              applicantId: id,
            });
          }}
        />
      )}

      {/* Archive applicant */}
      <Modal
        open={archiving !== null}
        onOpenChange={(open) => !open && !isPending && setArchiving(null)}
        title="Archive applicant?"
        size="sm"
      >
        {archiving && (
          <div className="space-y-4 text-sm">
            <p>
              <span className="font-semibold">{archiving.row.name}</span> ({applicantId(archiving.row)}) and their
              applications, exam records, and documents will be moved to Archive History and hidden from every
              list, report, and map.
            </p>
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
              You can recover the record from Archive History. If it isn&apos;t recovered within a year, it is
              deleted permanently.
            </p>
            {archiving.error && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2.5 text-red-800">
                {archiving.error}
              </p>
            )}
            <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setArchiving(null)}
                disabled={isPending}
                className="h-9 rounded-md border border-neutral-400 bg-white px-4 hover:bg-neutral-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmArchive(archiving.row)}
                disabled={isPending}
                className="h-9 rounded-md bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {isPending ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
