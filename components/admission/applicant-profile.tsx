import Link from "next/link";
import type { ReactNode } from "react";

import { EditApplicantButton } from "@/components/admission/applicant-form-modal";
import { PrintButton, ProfileTabs } from "@/components/admission/profile-tabs";
import UpdateApplicationStageForm from "@/components/admission/update-application-stage-form";
import type { ApplicantProfileData } from "@/features/admission/applicant-profile-query";
import { DOCUMENT_SLOTS, formatFileSize } from "@/features/admission/documents";
import {
  ADMISSION_STAGES,
  ADMITTED_STAGES,
  EXAM_RESULT_PASSED,
  stageBadgeClass,
} from "@/features/admission/stages";

type Stage = { stage_id: number; stage_name: string };

type StepState = "done" | "current" | "failed" | "pending";

const cardClass = "rounded-xl border border-neutral-500 bg-white/90 p-4";

/** Applicant form step that holds the document uploads ("Previous school"). */
const DOCUMENTS_STEP = 2;

function formatDate(date: Date | null | undefined) {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "--";
  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function programLabel(
  program: { program_code: string; program_name: string } | null | undefined,
) {
  return program ? `${program.program_code} – ${program.program_name}` : null;
}

function InfoLine({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex gap-1 text-sm">
      <dt className="shrink-0 text-neutral-700">{label}:</dt>
      <dd className="min-w-0 break-words">{value || "--"}</dd>
    </div>
  );
}

/** Applied → Exam → Result → Enrolled, derived from the current stage. */
function getSteps(stageName: string | null, hasExamResult: boolean) {
  const S = ADMISSION_STAGES;
  const afterExam: string[] = [
    S.EXAM_COMPLETED,
    S.PASSED,
    S.FAILED,
    S.ENROLLED,
    S.NOT_ENROLLED,
  ];

  const exam: StepState =
    afterExam.includes(stageName ?? "") || hasExamResult
      ? "done"
      : stageName === S.FOR_EXAMINATION
        ? "current"
        : "pending";

  let result: StepState = "pending";
  if (stageName === S.FAILED) result = "failed";
  else if (ADMITTED_STAGES.includes(stageName ?? "")) result = "done";
  else if (stageName === S.EXAM_COMPLETED) result = "current";

  let enrolled: StepState = "pending";
  if (stageName === S.ENROLLED) enrolled = "done";
  else if (stageName === S.NOT_ENROLLED) enrolled = "failed";
  else if (stageName === S.PASSED) enrolled = "current";

  return [
    { label: "Applied", state: "done" as StepState },
    { label: "Exam", state: exam },
    { label: "Result", state: result },
    { label: stageName === S.NOT_ENROLLED ? "Not enrolled" : "Enrolled", state: enrolled },
  ];
}

function StepIcon({ state }: Readonly<{ state: StepState }>) {
  if (state === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-green-500 text-white">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-red-500 text-white">
        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`size-6 rounded-full border-2 bg-white ${
        state === "current" ? "border-[#191e73] ring-2 ring-[#191e73]/25" : "border-neutral-400"
      }`}
    />
  );
}

export default function ApplicantProfile({
  applicant,
  stages,
  canWrite,
  showEnrollmentLink = true,
}: Readonly<{
  applicant: ApplicantProfileData;
  stages: Stage[];
  canWrite: boolean;
  /** False when the viewer can't open Enrollment Verification (e.g. Guidance). */
  showEnrollmentLink?: boolean;
}>) {
  const application = applicant.tbl_application[0];
  const fullName = [
    applicant.first_name,
    applicant.middle_name,
    applicant.last_name,
    applicant.suffix,
  ]
    .filter(Boolean)
    .join(" ");
  const applicantNo = String(applicant.applicant_id).padStart(6, "0");
  const stageName = application?.tbl_admission_stage?.stage_name ?? null;

  const header = (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-500 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-[#e3e4f8] text-xl font-semibold"
        >
          {applicant.first_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <p className="text-sm text-neutral-700">
            {applicantNo} - {application?.tbl_program?.program_code ?? "No course"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-4 py-1 text-sm font-medium ${stageBadgeClass(stageName)}`}>
          {stageName ?? "No application"}
        </span>
        {showEnrollmentLink && application && ADMITTED_STAGES.includes(stageName ?? "") && (
          <Link
            href={`/admission/enrollment-verification/${application.application_id}`}
            className="rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100 print:hidden"
          >
            Enrollment
          </Link>
        )}
        {canWrite && application && (
          <EditApplicantButton
            applicantId={applicant.applicant_id}
            subtitle={`${fullName} · ${application.application_no}`}
            className="rounded-full bg-[#191e73] px-5 py-1 text-sm font-medium text-white hover:bg-[#232a99] print:hidden"
          >
            Edit
          </EditApplicantButton>
        )}
        <PrintButton />
      </div>
    </div>
  );

  if (!application) {
    return (
      <div className="space-y-4">
        {header}
        <div className={`${cardClass} text-center text-sm text-neutral-600`}>
          This applicant has no application yet.
        </div>
      </div>
    );
  }

  // ----- Overview -----
  const address = [
    application.tbl_barangay && `Brgy. ${application.tbl_barangay.barangay_name}`,
    application.tbl_barangay?.tbl_district?.district_name,
    "Quezon City",
  ]
    .filter(Boolean)
    .join(", ");

  const choices = [
    application.tbl_program,
    application.program_choice_2,
    application.program_choice_3,
  ]
    .map(programLabel)
    .filter((label): label is string => Boolean(label));

  const school = application.tbl_school;
  const previousSchool = school
    ? [
        school.school_name,
        school.school_type && `(${school.school_type})`,
        school.city_municipality && `– ${school.city_municipality}`,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  const latestResult = application.tbl_exam_result[0];
  const passingSetting = application.tbl_admission_cycle?.tbl_passing_score_setting[0];
  const maxScore = latestResult?.tbl_exam?.max_score ?? null;
  const percentage =
    latestResult?.percentage === null || latestResult?.percentage === undefined
      ? null
      : Number(latestResult.percentage);
  const steps = getSteps(stageName, Boolean(latestResult));

  const overview = (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${cardClass} min-h-72`}>
        <h2 className="mb-3 text-lg font-semibold">Applicant information</h2>
        <dl className="space-y-1.5">
          <InfoLine label="Mobile" value={applicant.mobile_no} />
          <InfoLine label="Email" value={applicant.email} />
          <InfoLine label="Address" value={address} />
          <InfoLine label="Previous school" value={previousSchool} />
          <InfoLine label="Campus" value={application.tbl_branch?.branch_name} />
          <InfoLine
            label="Choices"
            value={
              choices.length > 0 ? (
                <ol className="list-inside list-decimal">
                  {choices.map((choice) => (
                    <li key={choice}>{choice}</li>
                  ))}
                </ol>
              ) : null
            }
          />
        </dl>

        <hr className="my-3 border-neutral-300" />

        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          <InfoLine label="Birthdate" value={formatDate(applicant.birth_date)} />
          <InfoLine label="Sex" value={applicant.sex} />
          <InfoLine label="Application no." value={application.application_no} />
          <InfoLine label="Date applied" value={formatDate(application.application_date)} />
          <InfoLine label="School year" value={application.tbl_admission_cycle?.school_year} />
        </dl>
      </section>

      <section className={`${cardClass} min-h-72`}>
        <h2 className="mb-4 text-lg font-semibold">Admission status</h2>

        <ol className="mb-5 flex items-start" aria-label="Admission progress">
          {steps.map((step, index) => (
            <li key={step.label} className="flex flex-1 flex-col items-center last:flex-none">
              <div className="flex w-full items-center">
                <StepIcon state={step.state} />
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`h-0.5 flex-1 ${step.state === "done" ? "bg-neutral-700" : "bg-neutral-300"}`}
                  />
                )}
              </div>
              <span
                className={`mt-1 w-full text-xs text-neutral-800 ${
                  index === steps.length - 1 ? "text-right" : ""
                }`}
              >
                {step.label}
                <span className="sr-only"> ({step.state})</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-neutral-400 bg-neutral-200/80 p-4">
          <p className="text-sm text-neutral-800">Exam score</p>
          <p className="text-3xl font-bold">
            {latestResult?.raw_score ?? 0}/{maxScore ?? 0}
            {percentage !== null && (
              <span className="ml-2 text-base font-medium text-neutral-700">({percentage}%)</span>
            )}
          </p>
          <div
            className="mt-2 h-4 overflow-hidden rounded-full border border-neutral-500 bg-neutral-400"
            role="progressbar"
            aria-label="Exam score percentage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage ?? 0}
          >
            <div
              className={`h-full ${latestResult?.result_status === EXAM_RESULT_PASSED ? "bg-green-500" : "bg-[#191e73]"}`}
              style={{ width: `${Math.min(100, Math.max(0, percentage ?? 0))}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-neutral-800">
            Passing score (reference):{" "}
            {passingSetting?.passing_value === null || passingSetting?.passing_value === undefined
              ? "Not set"
              : `${Number(passingSetting.passing_value)}${passingSetting.criteria_type ? ` (${passingSetting.criteria_type})` : ""}`}
          </p>
          {!latestResult && (
            <p className="mt-1 text-xs text-neutral-600">No exam result recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );

  // ----- Documents -----
  const documents = (
    <section className={cardClass}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Documents</h2>
        {canWrite && (
          <EditApplicantButton
            applicantId={applicant.applicant_id}
            subtitle={`${fullName} · ${application.application_no}`}
            initialStep={DOCUMENTS_STEP}
            className="w-fit rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100 print:hidden"
          >
            Upload / replace
          </EditApplicantButton>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              {["Document", "File", "Uploaded"].map((heading) => (
                <th key={heading} className="border border-neutral-400 px-3 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOCUMENT_SLOTS.map((slot) => {
              const document = application.tbl_application_document.find(
                (doc) => doc.document_type === slot.documentType,
              );
              return (
                <tr key={slot.key}>
                  <td className="border border-neutral-400 px-3 py-2">{slot.label}</td>
                  <td className="border border-neutral-400 px-3 py-2">
                    {document ? (
                      <a
                        href={`/api/documents/${document.document_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#191e73] hover:underline"
                      >
                        {document.file_name}
                        <span className="ml-1 text-xs text-neutral-500">
                          ({formatFileSize(document.file_size)})
                        </span>
                      </a>
                    ) : (
                      <span className="text-amber-700">Missing</span>
                    )}
                  </td>
                  <td className="border border-neutral-400 px-3 py-2">
                    {document
                      ? `${formatDateTime(document.uploaded_at)}${document.tbl_user_account ? ` · ${document.tbl_user_account.full_name}` : ""}`
                      : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  // ----- Exam -----
  const exam = (
    <section className={cardClass}>
      <h2 className="mb-3 text-lg font-semibold">Exam results</h2>
      {application.tbl_exam_result.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 text-left">
                {["Exam", "Date", "Score", "Percentage", "Result"].map((h) => (
                  <th key={h} className="border border-neutral-400 px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {application.tbl_exam_result.map((result) => (
                <tr key={result.result_id}>
                  <td className="border border-neutral-400 px-3 py-2">
                    {result.tbl_exam?.exam_name ?? "--"}
                  </td>
                  <td className="border border-neutral-400 px-3 py-2">
                    {formatDate(result.tbl_exam?.exam_date)}
                  </td>
                  <td className="border border-neutral-400 px-3 py-2">
                    {result.raw_score ?? "--"}
                    {result.tbl_exam?.max_score ? `/${result.tbl_exam.max_score}` : ""}
                  </td>
                  <td className="border border-neutral-400 px-3 py-2">
                    {result.percentage === null ? "--" : `${Number(result.percentage)}%`}
                  </td>
                  <td className="border border-neutral-400 px-3 py-2">
                    <span
                      className={
                        result.result_status === EXAM_RESULT_PASSED
                          ? "font-medium text-green-700"
                          : "font-medium text-red-600"
                      }
                    >
                      {result.result_status ?? "--"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No exam results recorded yet.</p>
      )}
    </section>
  );

  // ----- History -----
  const history = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {canWrite && (
        <section className={`${cardClass} h-fit print:hidden`}>
          <h2 className="mb-1 text-lg font-semibold">Update admission stage</h2>
          <p className="mb-3 text-sm text-neutral-600">
            Enrolled / Not Enrolled are set through Enrollment Verification.
          </p>
          <UpdateApplicationStageForm
            applicationId={application.application_id}
            currentStageId={application.tbl_admission_stage?.stage_id ?? null}
            stages={stages}
          />
        </section>
      )}
      <section className={`${cardClass} ${canWrite ? "" : "lg:col-span-2"}`}>
        <h2 className="mb-3 text-lg font-semibold">Stage history</h2>
        {application.tbl_application_stage_log.length > 0 ? (
          <ol className="relative space-y-4 border-l-2 border-neutral-300 pl-5">
            {application.tbl_application_stage_log.map((log) => (
              <li key={log.log_id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1 -left-[27px] size-3 rounded-full border-2 border-white bg-[#191e73]"
                />
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium">
                    {log.tbl_admission_stage?.stage_name ?? "Unknown stage"}
                  </p>
                  <span className="text-xs text-neutral-600">{formatDateTime(log.changed_at)}</span>
                </div>
                <p className="text-sm text-neutral-700">
                  By {log.tbl_user_account?.full_name ?? log.tbl_user_account?.email ?? "Unknown user"}
                </p>
                {log.remarks && <p className="text-sm">{log.remarks}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-600">No stage history available.</p>
        )}
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      {header}
      <ProfileTabs
        label="Applicant sections"
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "documents", label: "Documents", content: documents },
          { id: "exam", label: "Exam", content: exam },
          { id: "history", label: "History", content: history },
        ]}
      />
    </div>
  );
}
