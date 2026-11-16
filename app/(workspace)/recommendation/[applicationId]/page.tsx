import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { AdvisoryDialog, AdvisoryNote } from "@/components/recommendation/advisory-dialog";
import { MatchPerCourse } from "@/components/recommendation/charts";
import { GenerateButton } from "@/components/recommendation/controls";
import { fitClass, fitLabel } from "@/features/recommendation/config";
import { buildReasons, getApplicationRecommendation } from "@/features/recommendation/queries";
import { requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { BackLink } from "@/components/ui/back-link";

type PageProps = Readonly<{ params: Promise<{ applicationId: string }> }>;

function CourseCard({
  title,
  course,
  match,
}: Readonly<{
  title: string;
  course: { program_code: string; program_name: string } | null;
  match: number | null;
}>) {
  return (
    <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
      <h2 className="mb-2 text-sm font-semibold text-neutral-800">{title}</h2>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">
          {course ? `${course.program_code} – ${course.program_name}` : "None"}
        </p>
        <p className="text-lg font-semibold tabular-nums">{match === null ? "--" : `${match}%`}</p>
      </div>
      <div
        className="mt-2 h-3 rounded-r-[4px] bg-neutral-200"
        role="meter"
        aria-label={`${title} match`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={match ?? 0}
      >
        <div className="h-full rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${match ?? 0}%` }} />
      </div>
      <span className={`mt-3 inline-block rounded-full px-3 py-0.5 text-xs font-medium ${fitClass(match)}`}>
        {fitLabel(match)}
      </span>
    </section>
  );
}

async function RecommendationDetailContent({ params }: PageProps) {
  await connection();
  const user = await requirePermission("recommendation", "read");
  const canWrite = await hasPermission(user.role, "recommendation", "write");

  const { applicationId: raw } = await params;
  const applicationId = Number(raw);
  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) notFound();

  const data = await getApplicationRecommendation(applicationId);
  if (!data) notFound();

  const top = data.ranking[0] ?? null;
  const preferredRank = data.preferred
    ? data.ranking.find((r) => r.program_id === data.preferred!.program_id) ?? null
    : null;
  const reasons = buildReasons(data);
  const query = `application=${data.application_id}`;

  return (
    <div className="relative isolate min-h-full space-y-4 p-4 sm:p-6">
      <QcuWatermark />
      <AdvisoryDialog />

      <BackLink href="/recommendation">Back to Course Recommendation</BackLink>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-500 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-[#e3e4f8] text-xl font-semibold"
          >
            {data.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.full_name}</h1>
            <p className="text-sm text-neutral-700">
              {data.applicant_id ? String(data.applicant_id).padStart(6, "0") : "--"} · Exam score{" "}
              {data.exam?.percentage != null ? `${data.exam.percentage}%` : "--"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/recommendation/breakdown?${query}`}
            className="rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100"
          >
            Score breakdown
          </Link>
          <Link
            href={`/recommendation/compare?${query}`}
            className="rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100"
          >
            Compare courses
          </Link>
          {data.applicant_id && (
            <Link
              href={`/admission/applicants/${data.applicant_id}`}
              className="rounded-full border border-neutral-500 bg-white px-4 py-1 text-sm hover:bg-neutral-100"
            >
              Profile
            </Link>
          )}
        </div>
      </div>

      {data.ranking.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            {data.exam
              ? "No recommendation has been generated for this applicant yet."
              : "This applicant has no scored exam answers, so a recommendation cannot be generated."}
          </p>
          {canWrite && data.exam && data.cycle_id && (
            <GenerateButton cycleId={data.cycle_id} label="Generate for this school year" />
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <CourseCard title="Preferred course (1st choice)" course={data.preferred} match={preferredRank?.match ?? null} />
            <CourseCard title="Recommended course" course={top} match={top?.match ?? null} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
              <h2 className="mb-2 font-semibold">Why this recommendation</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {data.choices.length > 1 && (
                <p className="mt-3 text-sm text-neutral-700">
                  Applicant&apos;s choices:{" "}
                  {data.choices
                    .map((choice, index) => {
                      const rank = data.ranking.find((r) => r.program_id === choice.program_id);
                      return `${index + 1}. ${choice.program_code}${rank ? ` (${rank.match}%)` : ""}`;
                    })
                    .join(" · ")}
                </p>
              )}
              <div className="mt-4">
                <AdvisoryNote />
              </div>
            </section>

            <section className="rounded-xl border border-neutral-500 bg-white/90 p-4">
              <h2 className="mb-2 font-semibold">Match per course</h2>
              <MatchPerCourse
                ranking={data.ranking}
                selectedId={top?.program_id}
                preferredId={data.preferred?.program_id}
                hrefFor={(programId) => `/recommendation/compare?${query}&program=${programId}`}
              />
            </section>
          </div>

          {data.generated_at && (
            <p className="text-xs text-neutral-600">
              Generated {new Date(data.generated_at).toLocaleString("en-PH")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function RecommendationDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <RecommendationDetailContent params={params} />
    </Suspense>
  );
}
