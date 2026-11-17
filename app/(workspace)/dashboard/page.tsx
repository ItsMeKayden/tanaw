import { connection } from "next/server";

import { auth } from "@/auth";
import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { resolveCycle } from "@/features/admission/admission-stats";
import { ADMISSION_STAGES, EXAM_RESULT_PASSED } from "@/features/admission/stages";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type PageProps = Readonly<{
	searchParams: Promise<{
		cycle?: string | string[];
		campus?: string | string[];
		course?: string | string[];
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
						<p className="text-xl font-semibold">No admission cycle exists yet.</p>
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

	const [applicants, tookExam, passedExam, failedExam, enrolled] = await Promise.all([
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
	]);

	const stats = [
		{ label: "Applicants", value: applicants, tone: "bg-[#e7f0ff]", percent: "0% vs last year" },
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
				/>

				<div className="grid gap-3 md:grid-cols-5">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className={`${stat.tone} rounded-xl border border-[#cfcfcf] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]`}
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
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants</div>
						<svg viewBox="0 0 420 170" className="h-[170px] w-full overflow-visible">
							<path
								d="M0 130 L35 118 L70 110 L105 120 L140 115 L175 98 L210 110 L245 96 L280 90 L315 105 L350 80 L385 95 L420 72"
								fill="none"
								stroke="#7d85ba"
								strokeWidth="2.2"
								strokeLinejoin="round"
							/>
							<path
								d="M0 130 L35 118 L70 110 L105 120 L140 115 L175 98 L210 110 L245 96 L280 90 L315 105 L350 80 L385 95 L420 72 L420 170 L0 170 Z"
								fill="rgba(125,133,186,0.10)"
							/>
							{[0, 1, 2, 3, 4].map((i) => (
								<line
									key={i}
									x1="0"
									x2="420"
									y1={30 + i * 28}
									y2={30 + i * 28}
									stroke="rgba(148,163,184,0.35)"
									strokeDasharray="4 6"
								/>
							))}
							{["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"].map(
								(label, index) => (
									<text
										key={label + index}
										x={20 + index * 40}
										y="165"
										fill="#6b7280"
										fontSize="10"
									>
										{label}
									</text>
								)
							)}
						</svg>
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Public vs private applicants</div>
						<div className="flex items-center justify-center pt-2">
							<div
								className="relative flex h-32 w-32 items-center justify-center rounded-full"
								style={{
									background: `conic-gradient(#4d7fb6 0 ${Math.min(100, Math.round((passedExam / Math.max(applicants, 1)) * 100))}%, #dfeaf8 ${Math.min(100, Math.round((passedExam / Math.max(applicants, 1)) * 100))}% 100%)`,
								}}
							>
								<div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f7f7f7] text-[11px] font-semibold text-neutral-700">
									{applicants ? Math.min(100, Math.round((passedExam / Math.max(applicants, 1)) * 100)) : 0}%
								</div>
							</div>
						</div>
						<div className="mt-3 text-center text-[11px] text-neutral-600">
							{applicants} applicants
						</div>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission Funnel
						</div>
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
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">{enrolled}</div>
						<div className="mb-4 text-sm text-neutral-600">of 15,000 target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full bg-[#6ddeae]" style={{ width: `${Math.min((enrolled / 15000) * 100, 100)}%` }} />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>{enrolled >= 15000 ? "Quota met" : "Quota not met"}</div>
							<div>{Math.max(15000 - enrolled, 0)} slots remaining</div>
							<div>{Math.max(passedExam - enrolled, 0)} passers not yet enrolled</div>
						</div>
						<button
							type="button"
							className="mt-4 rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm"
						>
							View additional applicants
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default async function DashboardPage(props: PageProps) {
	const session = await auth();
	const role = session?.user?.role;

	if (role === "GUIDANCE") {
		return <GuidanceDashboard />;
	}

	if (role === "REGISTRAR" || role === "ADMISSION" || role === "SYSTEM_ADMIN") {
		return <RegistrarDashboard />;
	}

	if (role === "PRESIDENT") {
		return <DashboardContent {...props} />;
	}

	return <RegistrarDashboard />;
}

function GuidanceDashboard() {
	const stats = [
		{ label: "Generated", value: 0, tone: "bg-[#d9f3e6]" },
		{ label: "Match preferred", value: "0%", tone: "bg-[#f7f4cf]" },
		{ label: "Alternative", value: "0%", tone: "bg-[#d9ebff]" },
		{ label: "Flagged", value: "0%", tone: "bg-[#f5d7fa]" },
	];

	const preferredCourses = [
		{ label: "BSIT", value: 58 },
		{ label: "BS Accountancy", value: 67 },
		{ label: "BS Entrepreneurship", value: 65 },
		{ label: "BS Industrial Eng.", value: 60 },
		{ label: "BCEd", value: 70 },
	];

	const counselingApplicants = [
		{ initials: "A", name: "[LN, FN, MI]", status: "Low match", tone: "bg-[#f5d7de] text-[#8b1e3f]", badge: "bg-[#f4d9d7] text-[#8b1e3f]" },
		{ initials: "A", name: "[LN, FN, MI]", status: "Low match", tone: "bg-[#f5d7de] text-[#8b1e3f]", badge: "bg-[#f4d9d7] text-[#8b1e3f]" },
		{ initials: "A", name: "[LN, FN, MI]", status: "Low match", tone: "bg-[#f5d7de] text-[#8b1e3f]", badge: "bg-[#f4d9d7] text-[#8b1e3f]" },
		{ initials: "A", name: "[LN, FN, MI]", status: "Alt. Course", tone: "bg-[#f1d9ff] text-[#5a2a87]", badge: "bg-[#f7eeb0] text-[#7a6500]" },
		{ initials: "A", name: "[LN, FN, MI]", status: "Alt. Course", tone: "bg-[#f1d9ff] text-[#5a2a87]", badge: "bg-[#f7eeb0] text-[#7a6500]" },
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
					selectedSchoolYear=""
					selectedCampus=""
					selectedCourse=""
					schoolYears={[]}
					campuses={[]}
					courses={[]}
				/>

				<div className="grid gap-3 md:grid-cols-4">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className={`${stat.tone} rounded-xl border border-[#cfcfcf] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]`}
						>
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
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Match with preferred course (%)
						</div>

						<div className="space-y-3">
							{preferredCourses.map((item) => (
								<div key={item.label} className="grid grid-cols-[140px_minmax(0,1fr)_38px] items-center gap-3">
									<div className="text-[12px] font-medium text-neutral-700">{item.label}</div>
									<div className="relative h-5 overflow-hidden rounded-sm bg-[#edf2fb]">
										<div
											className="absolute inset-y-0 left-0 rounded-sm bg-[#2f6ed1]"
											style={{ width: `${item.value}%` }}
										/>
									</div>
									<div className="text-right text-[12px] font-medium text-neutral-700">{item.value}%</div>
								</div>
							))}
						</div>

						<div className="mt-4 ml-[140px] pr-[38px]">
							<div className="relative h-4">
								<div className="absolute inset-x-0 top-1 h-px bg-[#333333]" />
								{[0, 20, 40, 60, 80, 100].map((tick) => (
									<div
										key={tick}
										className="absolute top-0 h-2 w-px bg-[#333333]"
										style={{ left: `${tick}%` }}
									/>
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
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants for counselling</div>
						<div className="space-y-2">
							{counselingApplicants.map((applicant, index) => (
								<div
									key={`${applicant.name}-${index}`}
									className="flex items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white/80 px-2 py-2"
								>
									<div className="flex min-w-0 items-center gap-2">
										<span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${applicant.tone}`}>
											{applicant.initials}
										</span>
										<span className="truncate text-xs text-neutral-700">- {applicant.name}</span>
									</div>
									<span className={`rounded-md border px-2 py-1 text-[10px] font-medium ${applicant.badge}`}>
										{applicant.status}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission Funnel
						</div>
						<div className="space-y-3">
							{[
								{ label: "Applied", value: 0, width: "0%", color: "#5c6ce6" },
								{ label: "Took exam", value: 0, width: "0%", color: "#7a8cf0" },
								{ label: "Passed", value: 0, width: "0%", color: "#8ed0a4" },
								{ label: "Enrolled", value: 0, width: "0%", color: "#b9b9ff" },
							].map((item) => (
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
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">0</div>
						<div className="mb-4 text-sm text-neutral-600">of 15,000 target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full w-0 bg-[#6ddeae]" />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>Quota not met</div>
							<div>15,000 slots remaining</div>
							<div>0 passers not yet enrolled</div>
						</div>
						<button
							type="button"
							className="mt-4 rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm"
						>
							View additional applicants
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function RegistrarDashboard() {
	const stats = [
		{ label: "Awaiting exam schedule", value: 0, tone: "bg-[#d9f3e6]" },
		{ label: "Exam results to encode", value: 0, tone: "bg-[#edf3ff]" },
		{ label: "Passed, not yet enrolled", value: 0, tone: "bg-[#f1ebff]" },
		{ label: "Documents to verify", value: 0, tone: "bg-[#f4f4f4]" },
	];

	const applicantsNeedingAction = [
		{ applicantId: "0000-0000", name: "--", course: "--", action: "--", status: "" },
		{ applicantId: "0000-0000", name: "--", course: "--", action: "--", status: "" },
		{ applicantId: "0000-0000", name: "--", course: "--", action: "--", status: "" },
		{ applicantId: "0000-0000", name: "--", course: "--", action: "--", status: "" },
	];

	const funnel = [
		{ label: "Applied", value: 0, width: "0%", color: "#5c6ce6" },
		{ label: "Took exam", value: 0, width: "0%", color: "#7a8cf0" },
		{ label: "Passed", value: 0, width: "0%", color: "#8ed0a4" },
		{ label: "Enrolled", value: 0, width: "0%", color: "#b9b9ff" },
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
					selectedSchoolYear=""
					selectedCampus=""
					selectedCourse=""
					schoolYears={[]}
					campuses={[]}
					courses={[]}
				/>

				<div className="grid gap-3 md:grid-cols-4">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className={`${stat.tone} rounded-xl border border-[#cfcfcf] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]`}
						>
							<div className="text-[13px] font-medium text-[#202020]">{stat.label}</div>
							<div className="mt-2 text-3xl font-bold text-[#111827]">{stat.value}</div>
						</div>
					))}
				</div>

				<div className="mt-5 rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<div className="text-lg font-semibold text-neutral-800">Applicants needing action</div>
						<button type="button" className="text-sm text-[#3047ba]">
							View all
						</button>
					</div>

					<div className="overflow-hidden rounded-lg border border-neutral-300 bg-white/80">
						<table className="w-full text-left text-sm text-neutral-700">
							<thead className="bg-[#eef0ff] text-neutral-700">
								<tr>
									<th className="px-3 py-2 font-semibold">Applicant ID</th>
									<th className="px-3 py-2 font-semibold">Name</th>
									<th className="px-3 py-2 font-semibold">Course</th>
									<th className="px-3 py-2 font-semibold">Action needed</th>
									<th className="px-3 py-2 font-semibold">Status</th>
								</tr>
							</thead>
							<tbody>
								{applicantsNeedingAction.map((applicant, index) => (
									<tr key={`${applicant.applicantId}-${index}`} className="border-t border-neutral-200">
										<td className="px-3 py-2">{applicant.applicantId}</td>
										<td className="px-3 py-2">{applicant.name}</td>
										<td className="px-3 py-2">{applicant.course}</td>
										<td className="px-3 py-2">{applicant.action}</td>
										<td className="px-3 py-2">{applicant.status}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">Admission Funnel</div>
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
					</div>

					<div className="rounded-xl border border-[#2f5a8d] bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">Admission quota</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">0</div>
						<div className="mb-4 text-sm text-neutral-600">of 15,000 target students</div>
						<div className="mb-3 h-2 overflow-hidden rounded-full bg-[#e7e7e7]">
							<div className="h-full w-0 bg-[#6ddeae]" />
						</div>
						<div className="space-y-2 text-sm text-neutral-700">
							<div>Quota not met</div>
							<div>15,000 slots remaining</div>
							<div>0 passers not yet enrolled</div>
						</div>
						<button type="button" className="mt-4 rounded-md border border-neutral-400 bg-[#f6f6f6] px-3 py-2 text-sm text-neutral-800 shadow-sm">
							View additional applicants
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
