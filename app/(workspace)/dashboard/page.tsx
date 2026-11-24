import { Suspense } from "react";
import Link from "next/link";

import { connection } from "next/server";

import { auth } from "@/auth";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { OverviewSkeleton } from "@/components/ui/skeletons";
import { tableStyles } from "@/components/ui/table-styles";
import { resolveCycle } from "@/features/admission/admission-stats";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const applicationMonthLabels = [
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
] as const;
const applicationMonthMap = new Map<number, string>([
	[0, "Aug"],
	[1, "Sep"],
	[2, "Oct"],
	[3, "Nov"],
	[4, "Dec"],
	[5, "Jan"],
	[6, "Feb"],
	[7, "Mar"],
	[8, "Apr"],
	[9, "May"],
]);

function formatSignedPercent(value: number) {
	if (!Number.isFinite(value)) return "0% vs last year";
	const sign = value > 0 ? "+" : "";
	return `${sign}${Math.round(value)}% vs last year`;
}

function percentValue(part: number, whole: number) {
	if (!whole) return 0;
	return Math.round((part / whole) * 100);
}

function getMonthTrendValues(applications: Array<{ application_date: Date | string | null }>) {
	const counts = new Map<string, number>(applicationMonthLabels.map((label) => [label, 0]));

	for (const application of applications) {
		if (!application.application_date) continue;
		const date = new Date(application.application_date);
		if (Number.isNaN(date.getTime())) continue;

		const label = applicationMonthMap.get(date.getMonth());
		if (!label) continue;
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}

	return applicationMonthLabels.map((label) => counts.get(label) ?? 0);
}

type PageProps = Readonly<{
	searchParams: Promise<{
		cycle?: string | string[];
		campus?: string | string[];
		course?: string | string[];
		page?: string | string[];
	}>;
}>;

function toNumber(value: string | string[] | undefined) {
	const raw = Array.isArray(value) ? value[0] : value;
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

async function DashboardContent({ searchParams }: PageProps) {
	await connection();
	await requirePermission("dashboard", "read");

	const params = await searchParams;
	const { cycles, cycle } = await resolveCycle(params.cycle);
	const selectedCycleId = cycle?.cycle_id ?? null;
	const selectedCampusId = toNumber(params.campus);
	const selectedCourseId = toNumber(params.course);

	const [campuses, programs] = await Promise.all([
		prisma.tbl_branch.findMany({
			orderBy: { branch_name: "asc" },
			select: { branch_id: true, branch_name: true },
		}),
		prisma.tbl_program.findMany({
			orderBy: { program_code: "asc" },
			select: { program_id: true, program_code: true, program_name: true },
		}),
	]);

	const schoolYears = cycles.map((item) => ({
		value: String(item.cycle_id),
		label: item.school_year,
	}));

	const campusOptions = campuses.map((item) => ({
		value: String(item.branch_id),
		label: item.branch_name,
	}));

	const courseOptions = programs.map((item) => ({
		value: String(item.program_id),
		label: item.program_code,
	}));

	const selectedSchoolYearValue = selectedCycleId ? String(selectedCycleId) : "";
	const selectedCampusValue = selectedCampusId ? String(selectedCampusId) : "";
	const selectedCourseValue = selectedCourseId ? String(selectedCourseId) : "";

	if (!cycle) {
		return (
			<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
				<QcuWatermark />
				<div className="relative z-10 flex min-h-[320px] items-center justify-center">
					<div className="text-center text-neutral-700">
						<p className="text-xl font-semibold">No data available</p>
						<p className="mt-2 text-sm">
							Create a school year first to populate the dashboard.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const whereBase = {
		cycle_id: cycle.cycle_id,
		...(selectedCampusId ? { branch_id: selectedCampusId } : {}),
		...(selectedCourseId ? { program_id: selectedCourseId } : {}),
	};

	const [
		applicants,
		tookExam,
		passedExam,
		failedExam,
		enrolled,
		applications,
		previousCycle,
		publicSchoolApplicants,
		privateSchoolApplicants,
		quotaTotal,
	] = await Promise.all([
		prisma.tbl_application.count({ where: whereBase }),
		prisma.tbl_application.count({
			where: { ...whereBase, tbl_exam_result: { some: {} } },
		}),
		prisma.tbl_application.count({
			where: { ...whereBase, tbl_exam_result: { some: { result_status: EXAM_RESULT_PASSED } } },
		}),
		prisma.tbl_application.count({
			where: {
				...whereBase,
				tbl_exam_result: { some: {}, none: { result_status: EXAM_RESULT_PASSED } },
			},
		}),
		prisma.tbl_application.count({
			where: { ...whereBase, tbl_admission_stage: { stage_name: ADMISSION_STAGES.ENROLLED } },
		}),
		prisma.tbl_application.findMany({
			where: whereBase,
			select: { application_date: true },
		}),
		prisma.tbl_admission_cycle.findFirst({
			where: {
				cycle_id: { not: cycle.cycle_id },
				start_date: { not: null },
			},
			orderBy: { start_date: "desc" },
			select: { cycle_id: true },
		}),
		prisma.tbl_application.count({
			where: {
				...whereBase,
				tbl_school: { school_type: "Public" },
			},
		}),
		prisma.tbl_application.count({
			where: {
				...whereBase,
				tbl_school: { school_type: "Private" },
			},
		}),
		prisma.tbl_quota.aggregate({
			where: { cycle_id: cycle.cycle_id },
			_sum: { quota_slots: true },
		}),
	]);

	const previousApplicants = previousCycle
		? await prisma.tbl_application.count({
				where: {
					cycle_id: previousCycle.cycle_id,
					...(selectedCampusId ? { branch_id: selectedCampusId } : {}),
					...(selectedCourseId ? { program_id: selectedCourseId } : {}),
				},
		  })
		: 0;

	const applicantTrend = getMonthTrendValues(applications);
	const hasApplicantTrend = applicantTrend.some((value) => value > 0);
	const chartMax = Math.max(5000, ...applicantTrend, 1);
	const yTicks = [0, Math.round(chartMax * 0.25), Math.round(chartMax * 0.5), Math.round(chartMax * 0.75), chartMax];
	const publicShare = publicSchoolApplicants;
	const privateShare = privateSchoolApplicants;
	const publicPercent = applicants ? percentValue(publicShare, applicants) : 0;
	const privatePercent = applicants ? percentValue(privateShare, applicants) : 0;
	const totalQuotaSlots = Number(quotaTotal._sum.quota_slots ?? 0);
	const quotaProgress = totalQuotaSlots > 0 ? Math.min((enrolled / totalQuotaSlots) * 100, 100) : 0;
	const quotaRemaining = Math.max(totalQuotaSlots - enrolled, 0);
	const previousDifference = previousApplicants ? ((applicants - previousApplicants) / previousApplicants) * 100 : 0;
	const applicantChangeText = formatSignedPercent(previousDifference);

	const stats = [
		{ label: "Applicants", value: applicants, tone: "bg-[#e7f0ff]", percent: applicantChangeText },
		{ label: "Took exam", value: tookExam, tone: "bg-[#d9f8d6]", percent: `${applicants ? Math.round((tookExam / applicants) * 100) : 0}% of applicants` },
		{ label: "Passed", value: passedExam, tone: "bg-[#d9f3e6]", percent: `${tookExam ? Math.round((passedExam / tookExam) * 100) : 0}% of examinees` },
		{ label: "Failed", value: failedExam, tone: "bg-[#f8e2e2]", percent: `${tookExam ? Math.round((failedExam / tookExam) * 100) : 0}% of examinees` },
		{ label: "Enrolled", value: enrolled, tone: "bg-[#e9e2ff]", percent: `${passedExam ? Math.round((enrolled / passedExam) * 100) : 0}% of passers` },
	];

	const funnel = [
		{ label: "Applied", value: applicants, width: applicants ? "100%" : "0%", color: "#5c6ce6" },
		{ label: "Took exam", value: tookExam, width: applicants ? `${Math.max((tookExam / applicants) * 100, 0)}%` : "0%", color: "#7a8cf0" },
		{ label: "Passed", value: passedExam, width: tookExam ? `${Math.max((passedExam / tookExam) * 100, 0)}%` : "0%", color: "#8ed0a4" },
		{ label: "Enrolled", value: enrolled, width: passedExam ? `${Math.max((enrolled / passedExam) * 100, 0)}%` : "0%", color: "#b9b9ff" },
	];

	return (
		<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
			<QcuWatermark />

			<div className="relative z-10">
				<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-neutral-900">
							Dashboard
						</h1>
						<p className="text-sm text-neutral-700">
							Overview of institutional activity
						</p>
					</div>
				</div>

				<DashboardFilters
					selectedSchoolYear={selectedSchoolYearValue}
					selectedCampus={selectedCampusValue}
					selectedCourse={selectedCourseValue}
					schoolYears={schoolYears}
					campuses={campusOptions}
					courses={courseOptions}
					exportHref={`/api/reports/overview?cycle=${selectedCycleId ?? ""}${selectedCampusId ? `&campus=${selectedCampusId}` : ""}${selectedCourseId ? `&course=${selectedCourseId}` : ""}`}
				/>

				<div className="grid gap-3 md:grid-cols-5">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className={`rounded-xl border border-neutral-400 bg-white px-4 py-3 shadow-sm`}
						>
							<div className="text-[14px] font-medium text-[#202020]">{stat.label}</div>
							<div className="mt-2 flex items-end justify-between gap-3">
								<div className="text-3xl font-bold text-[#111827]">{stat.value}</div>
								<div className="text-[11px] font-medium text-[#4b5563]">{stat.percent}</div>
							</div>
						</div>
					))}
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
					<div className="rounded-[18px] border-[2px] border-[#1f4a9f] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants</div>
						<div className="relative h-[250px] w-full overflow-hidden">
							<div className="mb-2 pl-10 text-right text-[11px] font-medium text-neutral-700">
								Applications over time (total {applicants})
							</div>
							{hasApplicantTrend ? (
							<svg viewBox="0 0 420 200" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
								{yTicks.map((value) => {
									const y = 135 - (value / chartMax) * 95;
									return (
										<g key={value}>
											<line
												x1="52"
												x2="398"
												y1={y}
												y2={y}
												stroke="rgba(84, 92, 101, 0.8)"
												strokeDasharray="5 7"
											/>
											<text x="18" y={y + 3} fill="#4b5563" fontSize="9" textAnchor="end">
												{value}
											</text>
										</g>
									);
								})}

								<line x1="52" y1="135" x2="398" y2="135" stroke="#2d2d2d" strokeWidth="1.2" />
								<line x1="52" y1="22" x2="52" y2="135" stroke="#2d2d2d" strokeWidth="1.2" />

								{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => {
												const x = 58 + index * 37.777;
									return (
										<line
											key={`v-${index}`}
											x1={x}
											x2={x}
											y1="22"
											y2="135"
											stroke="rgba(148,163,184,0.24)"
											strokeDasharray="3 6"
										/>
									);
								})}

								<path
									d={applicationMonthLabels
										.map((label, index) => {
											const pointValue = applicantTrend[index] ?? 0;
											const x = 58 + index * 37.777;
											const y = 135 - (pointValue / chartMax) * 95;
											return `${index === 0 ? "M" : "L"}${x} ${y}`;
										})
										.join(" ")}
									fill="none"
									stroke="#1f3d8f"
									strokeWidth="2.7"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>

								{applicationMonthLabels.map((label, index) => {
									const pointValue = applicantTrend[index] ?? 0;
									const x = 58 + index * 37.777;
									const y = 135 - (pointValue / chartMax) * 95;
									return (
										<g key={`${label}-${index}`}>
											<circle cx={x} cy={y} r="3.8" fill="#1f3d8f" stroke="#ffffff" strokeWidth="1.5" />
											<text x={x} y={y - 9} fill="#2d3748" fontSize="8.5" textAnchor="middle">
												{pointValue.toLocaleString()}
											</text>
										</g>
									);
								})}

								{applicationMonthLabels.map((label, index) => (
									<text
										key={label}
										x={58 + index * 37.777}
										y="150"
										fill="#4b5563"
										fontSize="8.5"
										textAnchor={index === 0 ? "start" : index === applicationMonthLabels.length - 1 ? "end" : "middle"}
									>
										{label}
									</text>
								))}
							</svg>
							) : (
								<div className="flex h-[200px] items-center justify-center text-sm text-neutral-600">
									No data available
								</div>
							)}
						</div>
					</div>

					<div className="rounded-[18px] border-[2px] border-[#1f4a9f] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Public vs private applicants</div>
						{publicSchoolApplicants + privateSchoolApplicants > 0 ? (
							<div className="flex flex-col items-center justify-center pt-2">
								<div
									className="relative flex h-36 w-36 items-center justify-center rounded-full"
									style={{
										background: `conic-gradient(#5f8cc9 0 ${publicPercent}%, #dfeaf8 ${publicPercent}% 100%)`,
									}}
								>
									<div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f7f7f7] text-[11px] font-semibold text-neutral-700">
										{applicants ? publicPercent : 0}%
									</div>
								</div>
								<div className="mt-3 flex items-center gap-6 text-[11px] text-neutral-600">
									<div className="flex items-center gap-2">
										<span className="h-2.5 w-2.5 rounded-full bg-[#5f8cc9]" />
										<span>Public {applicants ? publicPercent : 0}%</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="h-2.5 w-2.5 rounded-full bg-[#dfeaf8]" />
										<span>Private {applicants ? privatePercent : 0}%</span>
									</div>
								</div>
								<div className="mt-3 text-center text-[11px] text-neutral-600">
									{applicants} applicants
								</div>
							</div>
						) : (
							<div className="flex h-44 items-center justify-center text-sm text-neutral-600">
								No data available
							</div>
						)}
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission Funnel
						</div>
						{applicants > 0 ? (
							<div className="space-y-3">
								{funnel.map((item) => (
									<div key={item.label} className="grid grid-cols-[110px_1fr] items-center gap-3">
										<div className="text-sm text-neutral-700">{item.label}</div>
										<div className="h-7 overflow-hidden rounded-md bg-[#ebedf5]">
											<div
												className="h-full rounded-md"
												style={{ width: item.width, backgroundColor: item.color }}
											/>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center text-sm text-neutral-600">No data available</div>
						)}
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">{enrolled}</div>
						<div className="mb-4 text-sm text-neutral-600">of {totalQuotaSlots} target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full rounded-full bg-[#6ddeae]" style={{ width: `${quotaProgress}%` }} />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>{totalQuotaSlots > 0 ? `${quotaRemaining} slots remaining` : "Quota not set"}</div>
							<div>{Math.max(totalQuotaSlots - enrolled, 0)} slots remaining</div>
							<div>{Math.max(passedExam - enrolled, 0)} passers not yet enrolled</div>
						</div>
						<Link
							href="/admission"
							className="mt-4 inline-flex rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm transition hover:bg-[#efefef]"
						>
							View additional applicants
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatFullName(applicant: { first_name?: string | null; middle_name?: string | null; last_name?: string | null; suffix?: string | null } | null | undefined) {
	if (!applicant) return "--";
	const parts = [applicant.first_name, applicant.middle_name, applicant.last_name];
	const fullName = parts.filter(Boolean).join(" ");
	return `${fullName}${applicant.suffix ? ` ${applicant.suffix}` : ""}`.trim() || "--";
}

function initialsFromName(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);
	if (!parts.length) return "A";
	return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A";
}

async function GuidanceDashboard({ searchParams }: PageProps) {
	await connection();
	await requirePermission("dashboard", "read");

	const params = await searchParams;
	const { cycles, cycle } = await resolveCycle(params.cycle);
	const selectedCycleId = cycle?.cycle_id ?? null;
	const selectedCampusId = toNumber(params.campus);
	const selectedCourseId = toNumber(params.course);

	const [campuses, programs] = await Promise.all([
		prisma.tbl_branch.findMany({
			orderBy: { branch_name: "asc" },
			select: { branch_id: true, branch_name: true },
		}),
		prisma.tbl_program.findMany({
			orderBy: { program_code: "asc" },
			select: { program_id: true, program_code: true, program_name: true },
		}),
	]);

	const schoolYears = cycles.map((item) => ({ value: String(item.cycle_id), label: item.school_year }));
	const campusOptions = campuses.map((item) => ({ value: String(item.branch_id), label: item.branch_name }));
	const courseOptions = programs.map((item) => ({ value: String(item.program_id), label: item.program_code }));

	const selectedSchoolYearValue = selectedCycleId ? String(selectedCycleId) : "";
	const selectedCampusValue = selectedCampusId ? String(selectedCampusId) : "";
	const selectedCourseValue = selectedCourseId ? String(selectedCourseId) : "";

	if (!cycle) {
		return (
			<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
				<QcuWatermark />
				<div className="relative z-10 flex min-h-[320px] items-center justify-center">
					<div className="text-center text-neutral-700">
						<p className="text-xl font-semibold">No data available</p>
						<p className="mt-2 text-sm">Create a school year first to populate guidance recommendations.</p>
					</div>
				</div>
			</div>
		);
	}

	const whereBase = {
		cycle_id: cycle.cycle_id,
		...(selectedCampusId ? { branch_id: selectedCampusId } : {}),
		...(selectedCourseId ? { program_id: selectedCourseId } : {}),
	};

	const [recommendationRows, applicationsCount, quotaTotal] = await Promise.all([
		prisma.tbl_application.findMany({
			where: {
				...whereBase,
				tbl_exam_result: { some: {} },
			},
			orderBy: { application_no: "asc" },
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
					},
				},
				tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
				tbl_course_recommendation: {
					orderBy: { rank_no: "asc" },
					select: {
						program_id: true,
						compatibility_score: true,
						rank_no: true,
						generated_at: true,
						tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
					},
				},
				tbl_exam_result: {
					orderBy: { result_id: "desc" },
					take: 1,
					select: { percentage: true },
				},
			},
		}),
		prisma.tbl_application.count({ where: { ...whereBase, tbl_exam_result: { some: {} } } }),
		prisma.tbl_quota.aggregate({ where: { cycle_id: cycle.cycle_id }, _sum: { quota_slots: true } }),
	]);

	const rows = recommendationRows.map((application) => {
		const recommendations = application.tbl_course_recommendation;
		const topRecommendation = recommendations[0];
		const preferred = application.tbl_program;
		const preferredMatch = preferred
			? recommendations.find((item) => item.program_id === preferred.program_id)?.compatibility_score
			: null;
		const percentage = application.tbl_exam_result[0]?.percentage == null ? null : Number(application.tbl_exam_result[0].percentage);
		let status: "COMPATIBLE" | "ALTERNATIVE" | "BELOW_MINIMUM" | "NOT_GENERATED" = "NOT_GENERATED";
		if (topRecommendation) {
			if (preferredMatch !== null && Number(preferredMatch) >= 60) status = "COMPATIBLE";
			else if (preferred && topRecommendation.program_id === preferred.program_id) status = "BELOW_MINIMUM";
			else status = "ALTERNATIVE";
		}

		return {
			application_id: application.application_id,
			application_no: application.application_no,
			full_name: formatFullName(application.tbl_applicant),
			preferred: preferred ? { code: preferred.program_code, name: preferred.program_name, id: preferred.program_id } : null,
			preferred_match: preferredMatch == null ? null : Number(preferredMatch),
			recommended: topRecommendation ? { code: topRecommendation.tbl_program.program_code, name: topRecommendation.tbl_program.program_name, id: topRecommendation.program_id } : null,
			recommended_match: topRecommendation ? Number(topRecommendation.compatibility_score) : null,
			generated_at: topRecommendation?.generated_at?.toISOString() ?? null,
			status,
			exam_percentage: percentage,
		};
	});

	const compatible = rows.filter((row) => row.status === "COMPATIBLE").length;
	const alternative = rows.filter((row) => row.status === "ALTERNATIVE").length;
	const belowMinimum = rows.filter((row) => row.status === "BELOW_MINIMUM").length;
	const pending = rows.filter((row) => row.status === "NOT_GENERATED").length;
	const generated = rows.filter((row) => row.generated_at).length;
	const totalExamined = rows.length || 0;
	const matchingPct = totalExamined ? Math.round((compatible / totalExamined) * 100) : 0;
	const alternativePct = totalExamined ? Math.round((alternative / totalExamined) * 100) : 0;
	const flaggedPct = totalExamined ? Math.round(((belowMinimum + pending) / totalExamined) * 100) : 0;

	const courseCounts = new Map<string, number>();
	rows.forEach((row) => {
		if (row.recommended?.code) {
			courseCounts.set(row.recommended.code, (courseCounts.get(row.recommended.code) ?? 0) + 1);
		}
	});

	const preferredCourses = Array.from(courseCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([code, count]) => ({
			label: code,
			value: totalExamined ? Math.round((count / totalExamined) * 100) : 0,
		}));

	const counselingApplicants = rows
		.slice()
		.sort((a, b) => {
			const priority = { "NOT_GENERATED": 0, "BELOW_MINIMUM": 1, "ALTERNATIVE": 2, "COMPATIBLE": 3 };
			return (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
		})
		.slice(0, 5)
		.map((row) => {
			const statusText = row.status === "COMPATIBLE" ? "Preferred match" : row.status === "ALTERNATIVE" ? "Alt course" : row.status === "BELOW_MINIMUM" ? "Low match" : "Pending";
			const tone = row.status === "COMPATIBLE" ? "bg-[#d9f3e6] text-[#1f6f45]" : row.status === "ALTERNATIVE" ? "bg-[#f1d9ff] text-[#5a2a87]" : row.status === "BELOW_MINIMUM" ? "bg-[#f5d7de] text-[#8b1e3f]" : "bg-[#f7f4cf] text-[#7a6500]";
			const badge = row.status === "COMPATIBLE" ? "bg-[#d9f3e6] text-[#1f6f45]" : row.status === "ALTERNATIVE" ? "bg-[#f7eeb0] text-[#7a6500]" : row.status === "BELOW_MINIMUM" ? "bg-[#f4d9d7] text-[#8b1e3f]" : "bg-[#f7f4cf] text-[#7a6500]";
			return {
				initials: initialsFromName(row.full_name),
				name: row.full_name,
				status: statusText,
				tone,
				badge,
			};
		});

	const totalQuotaSlots = Number(quotaTotal._sum.quota_slots ?? 0);
	const quotaProgress = totalQuotaSlots > 0 ? Math.min((applicationsCount / totalQuotaSlots) * 100, 100) : 0;
	const quotaRemaining = Math.max(totalQuotaSlots - applicationsCount, 0);
	const funnel = [
		{ label: "Applied", value: applicationsCount, width: applicationsCount ? "100%" : "0%", color: "#5c6ce6" },
		{ label: "Examined", value: totalExamined, width: totalExamined ? `${Math.min((totalExamined / Math.max(applicationsCount, 1)) * 100, 100)}%` : "0%", color: "#7a8cf0" },
		{ label: "Compatible", value: compatible, width: totalExamined ? `${Math.min((compatible / totalExamined) * 100, 100)}%` : "0%", color: "#8ed0a4" },
		{ label: "Recommended", value: generated, width: totalExamined ? `${Math.min((generated / totalExamined) * 100, 100)}%` : "0%", color: "#b9b9ff" },
	];

	return (
		<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
			<QcuWatermark />
			<div className="relative z-10">
				<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
					</div>
				</div>

				<DashboardFilters
					selectedSchoolYear={selectedSchoolYearValue}
					selectedCampus={selectedCampusValue}
					selectedCourse={selectedCourseValue}
					schoolYears={schoolYears}
					campuses={campusOptions}
					courses={courseOptions}
					exportHref={`/api/reports/overview?cycle=${selectedCycleId ?? ""}${selectedCampusId ? `&campus=${selectedCampusId}` : ""}${selectedCourseId ? `&course=${selectedCourseId}` : ""}`}
				/>

				<div className="grid gap-3 md:grid-cols-4">
					{[
						{ label: "Generated", value: generated, tone: "bg-[#d9f3e6]" },
						{ label: "Match preferred", value: `${matchingPct}%`, tone: "bg-[#f7f4cf]" },
						{ label: "Alternative", value: `${alternativePct}%`, tone: "bg-[#d9ebff]" },
						{ label: "Flagged", value: `${flaggedPct}%`, tone: "bg-[#f5d7fa]" },
					].map((stat) => (
						<div key={stat.label} className={`rounded-xl border border-neutral-400 bg-white px-4 py-3 shadow-sm`}>
							<div className="text-[14px] font-medium text-[#202020]">{stat.label}</div>
							<div className="mt-2 flex items-end justify-between gap-3">
								<div className="text-3xl font-bold text-[#111827]">{stat.value}</div>
								<div className="text-[11px] font-medium text-[#4b5563]">{stat.value === "0%" ? "0.0%" : ""}</div>
							</div>
						</div>
					))}
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">Match with preferred course (%)</div>
						<div className="space-y-3">
							{preferredCourses.length > 0 ? (
								preferredCourses.map((item) => (
									<div key={item.label} className="grid grid-cols-[140px_minmax(0,1fr)_38px] items-center gap-3">
										<div className="text-[12px] font-medium text-neutral-700">{item.label}</div>
										<div className="relative h-5 overflow-hidden rounded-sm bg-[#edf2fb]">
											<div className="absolute inset-y-0 left-0 rounded-sm bg-[#2f6ed1]" style={{ width: `${item.value}%` }} />
										</div>
										<div className="text-right text-[12px] font-medium text-neutral-700">{item.value}%</div>
									</div>
								))
							) : (
								<div className="text-sm text-neutral-600">No data available</div>
							)}
						</div>
						{preferredCourses.length > 0 && (
							<div className="mt-4 ml-[140px] pr-[38px]">
								<div className="relative h-4">
									<div className="absolute inset-x-0 top-1 h-px bg-[#333333]" />
									{[0, 20, 40, 60, 80, 100].map((tick) => (
										<div key={tick} className="absolute top-0 h-2 w-px bg-[#333333]" style={{ left: `${tick}%` }} />
									))}
								</div>
								<div className="mt-1 flex justify-between text-[10px] font-medium text-neutral-600">
									<span>0</span>
									<span>20</span>
									<span>40</span>
									<span>60</span>
									<span>80</span>
									<span>100</span>
								</div>
							</div>
						)}
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants for counselling</div>
						<div className="space-y-2">
							{counselingApplicants.length > 0 ? (
								counselingApplicants.map((applicant, index) => (
									<div key={`${applicant.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white/80 px-2 py-2">
										<div className="flex min-w-0 items-center gap-2">
											<span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${applicant.tone}`}>{applicant.initials}</span>
											<span className="truncate text-xs text-neutral-700">- {applicant.name}</span>
										</div>
										<span className={`rounded-md border px-2 py-1 text-[10px] font-medium ${applicant.badge}`}>{applicant.status}</span>
									</div>
								))
							) : (
								<div className="text-sm text-neutral-600">No data available</div>
							)}
						</div>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">Admission Funnel</div>
						{applicationsCount > 0 ? (
							<div className="space-y-3">
								{funnel.map((item) => (
									<div key={item.label} className="grid grid-cols-[110px_1fr] items-center gap-3">
										<div className="text-sm text-neutral-700">{item.label}</div>
										<div className="h-7 overflow-hidden rounded-md bg-[#ebedf5]">
											<div
												className="h-full rounded-md"
												style={{ width: item.width, backgroundColor: item.color }}
											/>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center text-sm text-neutral-600">No data available</div>
						)}
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">{applicationsCount}</div>
						<div className="mb-4 text-sm text-neutral-600">of {totalQuotaSlots} target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full rounded-full bg-[#6ddeae]" style={{ width: `${quotaProgress}%` }} />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>{totalQuotaSlots > 0 ? `${quotaRemaining} slots remaining` : "Quota not set"}</div>
							<div>{Math.max(totalQuotaSlots - applicationsCount, 0)} slots remaining</div>
							<div>{Math.max(compatible - applicationsCount, 0)} passers not yet enrolled</div>
						</div>
						<Link
							href="/recommendation"
							className="mt-4 inline-flex rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm transition hover:bg-[#efefef]"
						>
							View recommendation queue
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

async function RegistrarDashboard({ searchParams }: PageProps) {
	await connection();
	await requirePermission("dashboard", "read");

	const session = await auth();
	const userRole = session?.user?.role;
	const isAdmissionRole = userRole === "ADMISSION";

	const params = await searchParams;
	const { cycles, cycle } = await resolveCycle(params.cycle);
	const selectedCycleId = cycle?.cycle_id ?? null;
	const selectedCampusId = toNumber(params.campus);
	const selectedCourseId = toNumber(params.course);
	const requestedPage = toNumber(params.page) ?? 1;

	const [campuses, programs] = await Promise.all([
		prisma.tbl_branch.findMany({ orderBy: { branch_name: "asc" }, select: { branch_id: true, branch_name: true } }),
		prisma.tbl_program.findMany({ orderBy: { program_code: "asc" }, select: { program_id: true, program_code: true, program_name: true } }),
	]);

	const schoolYears = cycles.map((item) => ({ value: String(item.cycle_id), label: item.school_year }));
	const campusOptions = campuses.map((item) => ({ value: String(item.branch_id), label: item.branch_name }));
	const courseOptions = programs.map((item) => ({ value: String(item.program_id), label: item.program_code }));

	const selectedSchoolYearValue = selectedCycleId ? String(selectedCycleId) : "";
	const selectedCampusValue = selectedCampusId ? String(selectedCampusId) : "";
	const selectedCourseValue = selectedCourseId ? String(selectedCourseId) : "";

	if (!cycle) {
		return (
			<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
				<QcuWatermark />
				<div className="relative z-10 flex min-h-[320px] items-center justify-center">
					<div className="text-center text-neutral-700">
						<p className="text-xl font-semibold">No data available</p>
						<p className="mt-2 text-sm">Create a school year first to populate registrar operations.</p>
					</div>
				</div>
			</div>
		);
	}

	const whereBase = {
		cycle_id: cycle.cycle_id,
		...(selectedCampusId ? { branch_id: selectedCampusId } : {}),
		...(selectedCourseId ? { program_id: selectedCourseId } : {}),
	};

	const [actionQueue, quotaTotal, applicantsCount] = await Promise.all([
		prisma.tbl_application.findMany({
			where: whereBase,
			orderBy: { application_date: "desc" },
			select: {
				application_id: true,
				application_no: true,
				application_date: true,
				tbl_applicant: {
					select: { first_name: true, middle_name: true, last_name: true, suffix: true },
				},
				tbl_program: { select: { program_id: true, program_code: true, program_name: true } },
				tbl_admission_stage: { select: { stage_name: true } },
				tbl_exam_result: { select: { result_status: true, percentage: true } },
				tbl_application_document: { select: { document_id: true } },
			},
		}),
		prisma.tbl_quota.aggregate({ where: { cycle_id: cycle.cycle_id }, _sum: { quota_slots: true } }),
		prisma.tbl_application.count({ where: whereBase }),
	]);

	const awaitingExamSchedule = actionQueue.filter((application) => {
		const currentStage = application.tbl_admission_stage?.stage_name;
		return (
			(currentStage === ADMISSION_STAGES.APPLICATION_SUBMITTED || currentStage === ADMISSION_STAGES.FOR_EXAMINATION) &&
			application.tbl_exam_result.length === 0
		);
	}).length;

	const examResultsToEncode = actionQueue.filter((application) => {
		return application.tbl_exam_result.some((result) => result.result_status == null || result.result_status === "");
	}).length;

	const passedNotEnrolled = actionQueue.filter((application) => {
		return application.tbl_exam_result.some((result) => result.result_status === EXAM_RESULT_PASSED) &&
			application.tbl_admission_stage?.stage_name !== ADMISSION_STAGES.ENROLLED;
	}).length;

	const documentsToVerify = actionQueue.filter((application) => application.tbl_application_document.length > 0).length;

	const queueEntries = actionQueue
		.map((application) => {
			const currentStage = application.tbl_admission_stage?.stage_name;
			const resultStatus = application.tbl_exam_result[0]?.result_status;
			const documentCount = application.tbl_application_document.length;
			let action = "Review application";
			let status = "Pending";

			if (documentCount > 0) {
				action = "Verify documents";
				status = "Documents uploaded";
			} else if (currentStage === ADMISSION_STAGES.APPLICATION_SUBMITTED || currentStage === ADMISSION_STAGES.FOR_EXAMINATION) {
				action = "Schedule exam";
				status = "Awaiting exam";
			} else if (resultStatus == null || resultStatus === "") {
				action = "Encode exam result";
				status = "Results pending";
			} else if (resultStatus === EXAM_RESULT_PASSED && currentStage !== ADMISSION_STAGES.ENROLLED) {
				action = "Confirm enrollment";
				status = "Passed, not enrolled";
			} else if (currentStage === ADMISSION_STAGES.ENROLLED) {
				action = "Complete final review";
				status = "Enrolled";
			}

			return {
				applicantId: application.application_no,
				name: formatFullName(application.tbl_applicant),
				course: application.tbl_program?.program_code ?? "--",
				action,
				status,
			};
		})
		.filter((item) => item.action !== "Review application" || item.status !== "Pending");

	const applicantsNeedingAction = queueEntries.length;
	const totalPages = Math.max(1, Math.ceil(applicantsNeedingAction / 10));
	const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
	const pageStart = (currentPage - 1) * 10;
	const pageEnd = pageStart + 10;
	const queue = queueEntries.slice(pageStart, pageEnd);

	const pageHref = (pageNumber: number) => {
		const params = new URLSearchParams();
		if (selectedSchoolYearValue) params.set("cycle", selectedSchoolYearValue);
		if (selectedCampusValue) params.set("campus", selectedCampusValue);
		if (selectedCourseValue) params.set("course", selectedCourseValue);
		params.set("page", String(pageNumber));
		return `?${params.toString()}`;
	};

	const totalQuotaSlots = Number(quotaTotal._sum.quota_slots ?? 0);
	const quotaProgress = totalQuotaSlots > 0 ? Math.min((applicantsCount / totalQuotaSlots) * 100, 100) : 0;
	const quotaRemaining = Math.max(totalQuotaSlots - applicantsCount, 0);
	const funnel = [
		{ label: "Applied", value: applicantsCount, width: applicantsCount ? "100%" : "0%", color: "#5c6ce6" },
		{ label: "Took exam", value: actionQueue.filter((app) => app.tbl_exam_result.length > 0).length, width: applicantsCount ? `${Math.min((actionQueue.filter((app) => app.tbl_exam_result.length > 0).length / applicantsCount) * 100, 100)}%` : "0%", color: "#7a8cf0" },
		{ label: "Passed", value: actionQueue.filter((app) => app.tbl_exam_result.some((result) => result.result_status === EXAM_RESULT_PASSED)).length, width: applicantsCount ? `${Math.min((actionQueue.filter((app) => app.tbl_exam_result.some((result) => result.result_status === EXAM_RESULT_PASSED)).length / applicantsCount) * 100, 100)}%` : "0%", color: "#8ed0a4" },
		{ label: "Enrolled", value: actionQueue.filter((app) => app.tbl_admission_stage?.stage_name === ADMISSION_STAGES.ENROLLED).length, width: applicantsCount ? `${Math.min((actionQueue.filter((app) => app.tbl_admission_stage?.stage_name === ADMISSION_STAGES.ENROLLED).length / applicantsCount) * 100, 100)}%` : "0%", color: "#b9b9ff" },
	];

	return (
		<div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
			<QcuWatermark />
			<div className="relative z-10">
				<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
						<p className="text-sm text-neutral-700">Overview of institutional activity</p>
					</div>
				</div>

				<DashboardFilters
					selectedSchoolYear={selectedSchoolYearValue}
					selectedCampus={selectedCampusValue}
					selectedCourse={selectedCourseValue}
					schoolYears={schoolYears}
					campuses={campusOptions}
					courses={courseOptions}
					exportHref={`/api/reports/overview?cycle=${selectedCycleId ?? ""}${selectedCampusId ? `&campus=${selectedCampusId}` : ""}${selectedCourseId ? `&course=${selectedCourseId}` : ""}`}
				/>

				<div className="grid gap-3 md:grid-cols-4">
					{[
						{ label: "Awaiting exam schedule", value: awaitingExamSchedule, tone: "bg-[#d9f3e6]" },
						{ label: "Exam results to encode", value: examResultsToEncode, tone: "bg-[#edf3ff]" },
						{ label: "Passed, not yet enrolled", value: passedNotEnrolled, tone: "bg-[#f1ebff]" },
						{ label: "Documents to verify", value: documentsToVerify, tone: "bg-[#f4f4f4]" },
					].map((stat) => (
						<div key={stat.label} className={`rounded-xl border border-neutral-400 bg-white px-4 py-3 shadow-sm`}>
							<div className="text-[13px] font-medium text-[#202020]">{stat.label}</div>
							<div className="mt-2 text-3xl font-bold text-[#111827]">{stat.value}</div>
						</div>
					))}
				</div>

				<div className="mt-5 rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
					<div className="mb-4 flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="text-lg font-semibold text-neutral-800">Applicants needing action</div>
							<span className="rounded-full bg-[#eef0ff] px-2 py-0.5 text-xs font-semibold text-[#3047ba]">
								{applicantsNeedingAction}
							</span>
						</div>
						<div className="flex items-center gap-2">
							{isAdmissionRole && (
								<Link href="/admission" className="text-sm text-[#3047ba]">View all</Link>
							)}
						</div>
					</div>

					<div className={tableStyles.wrap}>
						<table className="w-full border-collapse text-sm">
							<thead>
								<tr className={tableStyles.headRow}>
									<th className={tableStyles.th}>Applicant ID</th>
									<th className={tableStyles.th}>Name</th>
									<th className={tableStyles.th}>Course</th>
									<th className={tableStyles.th}>Action needed</th>
									<th className={tableStyles.th}>Status</th>
								</tr>
							</thead>
							<tbody className={tableStyles.body}>
								{queue.length ? queue.map((applicant, index) => (
									<tr key={`${applicant.applicantId}-${index}`} className={tableStyles.row}>
										<td className={`${tableStyles.td} tabular-nums`}>{applicant.applicantId}</td>
										<td className={`${tableStyles.td} font-medium`}>{applicant.name}</td>
										<td className={tableStyles.td}>{applicant.course}</td>
										<td className={tableStyles.td}>{applicant.action}</td>
										<td className={tableStyles.td}>{applicant.status}</td>
									</tr>
								)) : (
									<tr>
										<td colSpan={5} className={tableStyles.empty}>No data available</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					{queueEntries.length > 0 && (
						<div className="mt-4 flex items-center justify-end gap-2">
							<Link
								href={pageHref(Math.max(1, currentPage - 1))}
								aria-disabled={currentPage <= 1}
								className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm ${currentPage <= 1 ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
							>
								←
							</Link>
							<div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] font-medium text-neutral-600">
								<span>Page</span>
								<span className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-neutral-700">{currentPage}</span>
								<span>of {totalPages}</span>
							</div>
							<Link
								href={pageHref(Math.min(totalPages, currentPage + 1))}
								aria-disabled={currentPage >= totalPages}
								className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm ${currentPage >= totalPages ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
							>
								→
							</Link>
						</div>
					)}
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">Admission Funnel</div>
						{applicantsCount > 0 ? (
							<div className="space-y-3">
								{funnel.map((item) => (
									<div key={item.label} className="grid grid-cols-[110px_1fr] items-center gap-3">
										<div className="text-sm text-neutral-700">{item.label}</div>
										<div className="h-7 overflow-hidden rounded-md bg-[#ebedf5]">
											<div
												className="h-full rounded-md"
												style={{ width: item.width, backgroundColor: item.color }}
											/>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center text-sm text-neutral-600">No data available</div>
						)}
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">{applicantsCount}</div>
						<div className="mb-4 text-sm text-neutral-600">of {totalQuotaSlots} target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full rounded-full bg-[#6ddeae]" style={{ width: `${quotaProgress}%` }} />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>{totalQuotaSlots > 0 ? `${quotaRemaining} slots remaining` : "Quota not set"}</div>
							<div>{Math.max(totalQuotaSlots - applicantsCount, 0)} slots remaining</div>
							<div>{Math.max(passedNotEnrolled, 0)} passers not yet enrolled</div>
						</div>
						{isAdmissionRole ? (
							<Link href="/admission" className="mt-4 inline-flex rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm transition hover:bg-[#efefef]">
								View additional applicants
							</Link>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

async function DashboardForRole(props: PageProps) {
	await connection();
	const session = await auth();
	const role = session?.user?.role;

	if (role === "GUIDANCE") {
		return <GuidanceDashboard {...props} />;
	}

	if (role === "REGISTRAR" || role === "ADMISSION") {
		return <RegistrarDashboard {...props} />;
	}

	if (role === "PRESIDENT" || role === "SYSTEM_ADMIN") {
		return <DashboardContent {...props} />;
	}

	return <RegistrarDashboard {...props} />;
}

export default function DashboardPage(props: PageProps) {
	return (
		<Suspense fallback={<OverviewSkeleton label="dashboard" />}>
			<DashboardForRole {...props} />
		</Suspense>
	);
}
