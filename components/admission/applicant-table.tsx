"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteApplicant } from "@/features/admission/actions/delete-applicant";

type Applicant = {
  applicant_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  sex: string | null;
  birth_date: Date | null;
  email: string | null;
  mobile_no: string | null;
  tbl_application: {
    application_no: string;
    application_date: Date;
    tbl_admission_stage: {
      stage_name: string;
    } | null;
    tbl_exam_result: {
      result_status: string | null;
      percentage: number | null;
    }[];
  }[];
};

type ApplicantTableProps = {
  applicants: Applicant[];
};

const PAGE_SIZE = 5;

export default function ApplicantTable({ applicants }: ApplicantTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [examResultFilter, setExamResultFilter] = useState("ALL");
  const router = useRouter();

  // Filter applicants based on the search query.
  const filteredApplicants = applicants.filter((applicant) => {
    const query = searchQuery.trim().toLowerCase();

    const fullName = [
      applicant.first_name,
      applicant.middle_name,
      applicant.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    const applicantId = String(applicant.applicant_id);
    const formattedId = applicantId.padStart(6, "0");

    const latestApplication = applicant.tbl_application[0];

    const status =
      latestApplication?.tbl_admission_stage?.stage_name ?? "No Application";

    const resultStatus =
      latestApplication?.tbl_exam_result[0]?.result_status ?? "NO_RESULT";

    const matchesSearch =
      applicantId.includes(query) ||
      formattedId.includes(query) ||
      fullName.toLowerCase().includes(query) ||
      (applicant.email ?? "").toLowerCase().includes(query) ||
      (applicant.mobile_no ?? "").toLowerCase().includes(query);

    const matchesStage = stageFilter === "ALL" || status === stageFilter;

    const matchesExamResult =
      examResultFilter === "ALL" ||
      (examResultFilter === "NO_RESULT"
        ? resultStatus === "NO_RESULT"
        : resultStatus.toUpperCase() === examResultFilter);

    return matchesSearch && matchesStage && matchesExamResult;
  });

  // Pagination based on filtered results.
  const totalPages = Math.max(
    1,
    Math.ceil(filteredApplicants.length / PAGE_SIZE),
  );

  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const currentApplicants = filteredApplicants.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );

  const startRecord = filteredApplicants.length === 0 ? 0 : startIndex + 1;

  const endRecord = Math.min(startIndex + PAGE_SIZE, filteredApplicants.length);

  return (
    <div className="space-y-4">
      {/* Search Bar, Filters, and Add Applicant Button */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:flex-1 xl:items-end">
          {/* Search */}
          <div className="flex w-full flex-col gap-1.5 xl:max-w-sm">
            <label htmlFor="applicant-search" className="text-sm font-medium">
              Search Applicants
            </label>

            <input
              id="applicant-search"
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by ID, name, email, or mobile number..."
              aria-label="Search applicants"
              className="h-10 w-full rounded-md border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Admission Stage Filter */}
          <div className="flex w-full flex-col gap-1.5 xl:max-w-48">
            <label htmlFor="stage-filter" className="text-sm font-medium">
              Admission Stage
            </label>

            <select
              id="stage-filter"
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="ALL">All Admission Stages</option>
              <option value="No Application">No Application</option>
              <option value="Application Submitted">
                Application Submitted
              </option>
              <option value="For Examination">For Examination</option>
              <option value="Exam Completed">Exam Completed</option>
              <option value="For Evaluation">For Evaluation</option>
              <option value="Failed">Failed</option>
              <option value="Enrolled">Enrolled</option>
            </select>
          </div>

          {/* Exam Result Filter */}
          <div className="flex w-full flex-col gap-1.5 xl:max-w-40">
            <label htmlFor="exam-result-filter" className="text-sm font-medium">
              Exam Result
            </label>

            <select
              id="exam-result-filter"
              value={examResultFilter}
              onChange={(event) => {
                setExamResultFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="ALL">All Exam Results</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
              <option value="NO_RESULT">No Result</option>
            </select>
          </div>
        </div>

        {/* Add Applicant */}
        <Link
          href="/admission/applicants/new"
          className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 xl:w-40"
        >
          + Add Applicant
        </Link>
      </div>

      {/* Applicant Table */}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b text-left">
                <th className="px-4 py-3 font-medium">Applicant ID</th>
                <th className="px-4 py-3 font-medium">Full Name</th>
                <th className="px-4 py-3 font-medium">Sex</th>
                <th className="px-4 py-3 font-medium">Birth Date</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Mobile Number</th>
                <th className="px-4 py-3 font-medium">Admission Stage</th>
                <th className="px-4 py-3 font-medium">Exam Result</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentApplicants.length > 0 ? (
                currentApplicants.map((applicant) => {
                  const fullName = [
                    applicant.first_name,
                    applicant.middle_name,
                    applicant.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const latestApplication = applicant.tbl_application[0];

                  const status =
                    latestApplication?.tbl_admission_stage?.stage_name ??
                    "No Application";

                  const examResult = latestApplication?.tbl_exam_result[0];

                  const resultStatus = examResult?.result_status ?? "--";
                  const percentage = examResult?.percentage;

                  return (
                    <tr
                      key={applicant.applicant_id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        {String(applicant.applicant_id).padStart(6, "0")}
                      </td>

                      <td className="px-4 py-3 font-medium">{fullName}</td>

                      <td className="px-4 py-3">{applicant.sex || "--"}</td>

                      <td className="px-4 py-3">
                        {applicant.birth_date
                          ? new Date(applicant.birth_date).toLocaleDateString(
                              "en-PH",
                            )
                          : "--"}
                      </td>

                      <td className="px-4 py-3">{applicant.email || "--"}</td>

                      <td className="px-4 py-3">
                        {applicant.mobile_no || "--"}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            status === "Enrolled"
                              ? "bg-green-100 text-green-700"
                              : status === "Failed"
                                ? "bg-red-100 text-red-700"
                                : status === "For Evaluation"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            resultStatus === "PASSED"
                              ? "bg-green-100 text-green-700"
                              : resultStatus === "FAILED"
                                ? "bg-red-100 text-red-700"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {resultStatus}
                          {percentage !== null && percentage !== undefined
                            ? ` (${percentage}%)`
                            : ""}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/admission/applicants/${applicant.applicant_id}`}
                            className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                          >
                            View
                          </Link>

                          <Link
                            href={`/admission/applicants/${applicant.applicant_id}/edit`}
                            className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                          >
                            Edit
                          </Link>

                          <button
                            type="button"
                            onClick={async () => {
                              const confirmed = window.confirm(
                                "Are you sure you want to delete this applicant? This action cannot be undone.",
                              );

                              if (!confirmed) return;

                              const result = await deleteApplicant(
                                applicant.applicant_id,
                              );

                              if (result.error) {
                                window.alert(result.error);
                                return;
                              }

                              window.alert("Applicant successfully deleted.");
                              router.refresh();
                            }}
                            className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    {searchQuery ||
                    stageFilter !== "ALL" ||
                    examResultFilter !== "ALL"
                      ? "No applicants match your search or filters."
                      : "No applicants found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startRecord}–{endRecord} of {filteredApplicants.length}{" "}
          applicants
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            Previous
          </button>

          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            disabled={currentPage === totalPages}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
