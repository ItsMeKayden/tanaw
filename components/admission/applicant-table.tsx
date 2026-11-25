"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";

import { ApplicantFormModal, type ApplicantFormRequest } from "@/components/admission/applicant-form-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";
import { archiveApplicant } from "@/features/admission/actions/archive-applicant";
import { clearForExam } from "@/features/admission/actions/requirements";
import type { ApplicantFormReference } from "@/features/admission/actions/load-applicant";
import { ADMISSION_STAGES, ADMISSION_STAGE_ORDER, stageBadgeClass } from "@/features/admission/stages";
import { toast } from "@/components/ui/toaster";
import { useSearchParams } from "next/navigation";
import { parseAdmissionStep } from "@/lib/admission-form-url";

export type ApplicantRow = {
  applicant_id: number;
  application_id: number | null;
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
  userId,
  applicants,
  canEdit,
  canArchive,
  profileBase,
  formData,
}: Readonly<{
  applicants: ApplicantRow[];
  userId: string;
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
  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [formRequest, setFormRequest] = useState<ApplicantFormRequest | null>(() => {
    const form = searchParams.get("admissionForm");
    const initialStep = parseAdmissionStep(searchParams.get("step"));
    if (form === "create") return { mode: "create", initialStep };
    const edit = /^edit-([1-9]\d*)$/.exec(form ?? "");
    return edit
      ? { mode: "edit", applicantId: Number(edit[1]), initialStep }
      : null;
  });
  const [archiving, setArchiving] = useState<ArchiveState>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  // Bulk "Clear for exam": checkboxes appear after clicking the button.
  const [clearMode, setClearMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [confirmingClear, setConfirmingClear] = useState(false);

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

  /** Only applicants still in Application Submitted can be cleared for the exam. */
  const canClear = (row: ApplicantRow) => row.application_id !== null && row.stage === ADMISSION_STAGES.APPLICATION_SUBMITTED;
  const readyOnPage = currentApplicants.filter(canClear);
  const allReadyOnPageSelected = readyOnPage.length > 0 && readyOnPage.every((row) => selected.has(row.application_id!));
  const selectedRows = applicants.filter((row) => row.application_id !== null && selected.has(row.application_id));

  function toggleRow(applicationId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  function toggleReadyOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of readyOnPage) {
        if (allReadyOnPageSelected) next.delete(row.application_id!);
        else next.add(row.application_id!);
      }
      return next;
    });
  }

  function exitClearMode() {
    setClearMode(false);
    setSelected(new Set());
  }

  function confirmClear() {
    const ids = selectedRows.map((row) => row.application_id!);
    startTransition(async () => {
      const result = await clearForExam(ids);
      toast.fromResult(result);
      setConfirmingClear(false);
      if (!("error" in result)) {
        exitClearMode();
        router.refresh();
      }
    });
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

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {canEdit && !clearMode && (
            <button
              type="button"
              onClick={() => {
                setClearMode(true);
                setStageFilter(ADMISSION_STAGES.APPLICATION_SUBMITTED);
                setCurrentPage(1);
              }}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[#191e73] bg-white px-4 text-sm font-semibold text-[#191e73] hover:bg-[#eef0fd] sm:w-auto"
              title="Move several Application Submitted applicants to For Examination at once"
            >
              <ListChecks className="size-4" aria-hidden="true" />
              Clear for exam
            </button>
          )}
          {canEdit && formData && (
            <button
              type="button"
              onClick={() => openForm({ mode: "create" })}
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white hover:bg-[#232a99] sm:w-40"
            >
              + Add Applicant
            </button>
          )}
        </div>
      </div>

      {clearMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#191e73]/30 bg-[#f4f5fd] px-3 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-neutral-800">
            <input
              type="checkbox"
              checked={allReadyOnPageSelected}
              onChange={toggleReadyOnPage}
              disabled={readyOnPage.length === 0}
              className="size-4 cursor-pointer accent-[#191e73]"
            />
            Select all ready on this page ({readyOnPage.length})
          </label>
          <span className={selectedRows.length ? "font-semibold text-[#191e73] tabular-nums" : "text-neutral-600"}>
            {selectedRows.length
              ? `${selectedRows.length} selected`
              : "Tick applicants in Application Submitted. Normally they're cleared automatically when their requirements are verified."}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={exitClearMode}
              disabled={isPending}
              className="inline-flex h-8 items-center rounded-md border border-neutral-500 bg-white px-3 text-sm hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={isPending || selectedRows.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#191e73] px-3 text-sm font-semibold text-white hover:bg-[#232a99] disabled:opacity-50"
            >
              Clear {selectedRows.length || ""} for exam
            </button>
          </div>
        </div>
      )}

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
              {clearMode && (
                <th className={`${th} w-10`}>
                  <span className="sr-only">Select</span>
                </th>
              )}
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
                  {clearMode && (
                    <td className={td}>
                      {canClear(row) ? (
                        <input
                          type="checkbox"
                          checked={selected.has(row.application_id!)}
                          onChange={() => toggleRow(row.application_id!)}
                          aria-label={`Select ${row.name}`}
                          className="size-4 cursor-pointer accent-[#191e73]"
                        />
                      ) : (
                        <span className="text-xs text-neutral-300" title="Only Application Submitted can be cleared">
                          —
                        </span>
                      )}
                    </td>
                  )}
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
                <td colSpan={clearMode ? 8 : 7} className={tableStyles.empty}>
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
          userId={userId}
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

      {/* Bulk clear for exam */}
      <ConfirmModal
        open={confirmingClear}
        onCancel={() => setConfirmingClear(false)}
        onConfirm={confirmClear}
        isPending={isPending}
        tone="primary"
        title="Clear for exam"
        heading={`Move ${selectedRows.length} applicant${selectedRows.length === 1 ? "" : "s"} to For Examination?`}
        description={`${selectedRows
          .slice(0, 5)
          .map((row) => row.name)
          .join(", ")}${selectedRows.length > 5 ? ` and ${selectedRows.length - 5} more` : ""}. They can then be seated in an exam session. Each change is recorded in the applicant's history.`}
        confirmLabel={isPending ? "Clearing…" : "Clear for exam"}
      />

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
