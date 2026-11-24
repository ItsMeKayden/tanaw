"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { tableStyles } from "@/components/ui/table-styles";
import { recoverApplicant } from "@/features/admission/actions/archive-applicant";
import { stageBadgeClass } from "@/features/admission/stages";
import { toast } from "@/components/ui/toaster";

export type ArchivedRow = {
  applicant_id: number;
  application_no: string | null;
  name: string;
  course_code: string | null;
  course_name: string | null;
  stage: string | null;
  /** ISO timestamps (serializable across the server/client boundary). */
  archived_at: string;
  archived_by: string | null;
  expires_at: string;
  days_left: number;
};

type Feedback = { type: "success" | "error"; text: string; applicantId?: number } | null;
type RecoverState = { row: ArchivedRow; error: string | null } | null;

const PAGE_SIZE = 10;

const th = tableStyles.th;
const td = tableStyles.td;
const fieldClass =
  "h-9 w-full rounded-md border border-neutral-500 bg-white px-3 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

const dateFormat = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));
const applicantId = (row: ArchivedRow) => row.application_no ?? String(row.applicant_id).padStart(6, "0");

function daysLeftClass(days: number) {
  if (days <= 30) return "text-red-700 font-medium";
  if (days <= 90) return "text-amber-700";
  return "text-neutral-700";
}

export default function ArchiveTable({ rows, canWrite }: Readonly<{ rows: ArchivedRow[]; canWrite: boolean }>) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [recovering, setRecovering] = useState<RecoverState>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const query = searchQuery.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      !query ||
      [applicantId(row), row.name, row.course_code, row.course_name, row.archived_by]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  function confirmRecover(row: ArchivedRow) {
    startTransition(async () => {
      const result = await recoverApplicant(row.applicant_id);
      if ("error" in result) {
        setRecovering({ row, error: result.error });
        toast.error(result.error);
        return;
      }
      setRecovering(null);
      toast.success(`${row.name} was recovered.`);
      setFeedback({ type: "success", text: `${row.name} was recovered.`, applicantId: row.applicant_id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex w-full flex-col gap-1 text-sm font-medium sm:max-w-sm">
        Search archive
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="ID, name, course, or archived by…"
          className={`${fieldClass} font-normal`}
        />
      </label>

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
              <Link href={`/admission/applicants/${feedback.applicantId}`} className="font-medium underline">
                View profile
              </Link>
            </>
          )}
        </p>
      )}

      <div className={tableStyles.wrap}>
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className={tableStyles.headRow}>
              <th className={th}>Applicant ID</th>
              <th className={th}>Name</th>
              <th className={th}>Preferred Course</th>
              <th className={th}>Status When Archived</th>
              <th className={th}>Archived</th>
              <th className={th}>Archived By</th>
              <th className={th}>Deleted On</th>
              {canWrite && <th className={th}>Actions</th>}
            </tr>
          </thead>
          <tbody className={tableStyles.body}>
            {visible.length > 0 ? (
              visible.map((row) => (
                <tr key={row.applicant_id} className={tableStyles.row}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{applicantId(row)}</td>
                  <td className={td}>{row.name}</td>
                  <td className={td} title={row.course_name ?? undefined}>
                    {row.course_code ?? "--"}
                  </td>
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
                  <td className={`${td} whitespace-nowrap`}>{formatDate(row.archived_at)}</td>
                  <td className={td}>{row.archived_by ?? "--"}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="block">{formatDate(row.expires_at)}</span>
                    <span className={`block text-xs ${daysLeftClass(row.days_left)}`}>
                      {row.days_left === 1 ? "1 day left" : `${row.days_left} days left`}
                    </span>
                  </td>
                  {canWrite && (
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          setRecovering({ row, error: null });
                        }}
                        className="rounded-md border border-green-600 bg-white inline-flex h-7 items-center px-2.5 text-xs font-medium text-green-800 hover:bg-green-50"
                      >
                        Recover
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canWrite ? 8 : 7} className={tableStyles.empty}>
                  {query ? "No archived applicants match your search." : "The archive is empty."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        start={filtered.length === 0 ? 0 : startIndex + 1}
        end={Math.min(startIndex + PAGE_SIZE, filtered.length)}
        total={filtered.length}
        noun="archived applicants"
        onPageChange={setCurrentPage}
      />

      <Modal
        open={recovering !== null}
        onOpenChange={(open) => !open && !isPending && setRecovering(null)}
        title="Recover applicant?"
        size="sm"
      >
        {recovering && (
          <div className="space-y-4 text-sm">
            <p>
              <span className="font-semibold">{recovering.row.name}</span> ({applicantId(recovering.row)}) will be
              restored to the applicant list with their applications, exam records, and documents.
            </p>
            {recovering.error && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2.5 text-red-800">
                {recovering.error}
              </p>
            )}
            <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setRecovering(null)}
                disabled={isPending}
                className="h-9 rounded-md border border-neutral-400 bg-white px-4 hover:bg-neutral-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmRecover(recovering.row)}
                disabled={isPending}
                className="h-9 rounded-md bg-green-700 px-4 font-semibold text-white hover:bg-green-800 disabled:opacity-60"
              >
                {isPending ? "Recovering…" : "Recover"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
