import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import EnrollmentDecision from "@/components/admission/enrollment-decision";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { DOCUMENT_SLOTS } from "@/features/admission/documents";
import { formatFullName } from "@/features/admission/enrollment-queries";
import {
  ADMISSION_STAGES,
  ENROLLMENT_DECISION_STAGES,
  EXAM_RESULT_PASSED,
  stageBadgeClass,
} from "@/features/admission/stages";
import { requireAnyPermission } from "@/lib/authorization";
import { hasAnyPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type PageProps = Readonly<{
  params: Promise<{ applicationId: string }>;
}>;

function InfoLine({ label, value }: Readonly<{ label: string; value: string | null | undefined }>) {
  return (
    <div className="flex gap-1 text-sm">
      <dt className="shrink-0 text-neutral-700">{label}:</dt>
      <dd>{value || "--"}</dd>
    </div>
  );
}

async function EnrollmentDetailContent({ params }: PageProps) {
  await connection();

  const user = await requireAnyPermission(["admission", "registrar"], "read");
  const canWrite = await hasAnyPermission(user.role, ["admission", "registrar"], "write");

  const { applicationId: rawId } = await params;
  const applicationId = Number(rawId);

  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
    notFound();
  }

  const application = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    select: {
      application_id: true,
      application_no: true,
      tbl_applicant: {
        select: {
          applicant_id: true,
          first_name: true,
          middle_name: true,
          last_name: true,
          suffix: true,
          email: true,
          mobile_no: true,
        },
      },
      tbl_program: { select: { program_code: true, program_name: true } },
      tbl_branch: { select: { branch_name: true } },
      tbl_school: { select: { school_name: true } },
      tbl_admission_cycle: { select: { school_year: true } },
      tbl_admission_stage: { select: { stage_name: true } },
      tbl_exam_result: {
        orderBy: { result_id: "desc" },
        select: {
          result_status: true,
          raw_score: true,
          percentage: true,
          tbl_exam: { select: { max_score: true } },
        },
      },
      // Metadata only — never load file_data here.
      tbl_application_document: {
        select: { document_id: true, document_type: true, file_name: true },
      },
      tbl_application_stage_log: {
        where: {
          tbl_admission_stage: {
            stage_name: { in: [...ENROLLMENT_DECISION_STAGES] },
          },
        },
        orderBy: { changed_at: "desc" },
        take: 1,
        select: {
          changed_at: true,
          remarks: true,
          tbl_user_account: { select: { full_name: true } },
        },
      },
    },
  });

  if (!application) {
    notFound();
  }

  const applicant = application.tbl_applicant;
  const stageName = application.tbl_admission_stage?.stage_name ?? null;
  const passedResult = application.tbl_exam_result.find(
    (result) => result.result_status === EXAM_RESULT_PASSED,
  );
  const decision = application.tbl_application_stage_log[0];

  const isPassed = stageName === ADMISSION_STAGES.PASSED;
  const isAdmitted =
    isPassed ||
    stageName === ADMISSION_STAGES.ENROLLED ||
    stageName === ADMISSION_STAGES.NOT_ENROLLED;

  let examLabel = "No passing result";
  if (passedResult) {
    const max = passedResult.tbl_exam?.max_score;
    const score =
      passedResult.raw_score !== null && max ? `${passedResult.raw_score}/${max}` : null;
    const pct =
      passedResult.percentage === null ? null : `${Number(passedResult.percentage)}%`;
    examLabel = ["PASSED", score, pct && `(${pct})`].filter(Boolean).join(" ");
  }

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />

      <Link
        href="/admission/enrollment-verification"
        className="inline-flex text-sm text-neutral-700 hover:text-[#191e73]"
      >
        ← Back to Enrollment Verification
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-500 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-[#e3e4f8] text-xl font-semibold"
          >
            {applicant?.first_name.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{formatFullName(applicant)}</h1>
            <p className="text-sm text-neutral-700">
              {applicant ? String(applicant.applicant_id).padStart(6, "0") : "--"}
              {" - "}
              {application.tbl_program?.program_code ?? "No course"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-4 py-1 text-sm font-medium ${stageBadgeClass(stageName)}`}>
            {stageName ?? "No stage"}
          </span>
          {applicant && (
            <Link
              href={`/admission/applicants/${applicant.applicant_id}`}
              className="rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100"
            >
              Profile
            </Link>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
        <h2 className="mb-3 text-lg font-semibold">Admission details</h2>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <InfoLine label="Application no." value={application.application_no} />
          <InfoLine label="School year" value={application.tbl_admission_cycle?.school_year} />
          <InfoLine
            label="Program"
            value={
              application.tbl_program
                ? `${application.tbl_program.program_code} – ${application.tbl_program.program_name}`
                : null
            }
          />
          <InfoLine label="Campus" value={application.tbl_branch?.branch_name} />
          <InfoLine label="Exam result" value={examLabel} />
          <InfoLine label="Previous school" value={application.tbl_school?.school_name} />
          <InfoLine label="Email" value={applicant?.email} />
          <InfoLine label="Mobile" value={applicant?.mobile_no} />
        </dl>

        <h3 className="mt-4 mb-2 font-semibold">Documents</h3>
        <ul className="space-y-1 text-sm">
          {DOCUMENT_SLOTS.map((slot) => {
            const document = application.tbl_application_document.find(
              (doc) => doc.document_type === slot.documentType,
            );
            return (
              <li key={slot.key} className="flex gap-1">
                <span className="text-neutral-700">{slot.label}:</span>
                {document ? (
                  <a
                    href={`/api/documents/${document.document_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#191e73] hover:underline"
                  >
                    {document.file_name} ↗
                  </a>
                ) : (
                  <span className="text-amber-700">Missing</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!isAdmitted && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          This application is in the &ldquo;{stageName ?? "unassigned"}&rdquo;
          stage. Only applicants in the &ldquo;Passed&rdquo; stage can be
          verified for enrollment.
        </div>
      )}

      {isPassed && !passedResult && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This application is marked &ldquo;Passed&rdquo; but has no PASSED
          examination result on record. Record the exam result before
          verifying enrollment.
        </div>
      )}

      <EnrollmentDecision
        applicationId={application.application_id}
        stageName={stageName}
        canDecide={canWrite}
        canEnroll={canWrite && isPassed && Boolean(passedResult)}
        decision={
          decision
            ? {
                by: decision.tbl_user_account?.full_name ?? null,
                at: decision.changed_at?.toISOString() ?? null,
                remarks: decision.remarks,
              }
            : null
        }
      />
    </div>
  );
}

export default function EnrollmentDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <EnrollmentDetailContent params={params} />
    </Suspense>
  );
}
