import { connection } from "next/server";
import { Search } from "lucide-react";
import { redirect } from "next/navigation";

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
		{ label: "Applicants", value: applicants, tone: "bg-[#f3f3f3]", percent: "0% vs last year" },
		{ label: "Took exam", value: tookExam, tone: "bg-[#f3f3f3]", percent: `${applicants ? Math.round((tookExam / applicants) * 100) : 0}% of applicants` },
		{ label: "Passed", value: passedExam, tone: "bg-[#d9f3e6]", percent: `${tookExam ? Math.round((passedExam / tookExam) * 100) : 0}% of examinees` },
		{ label: "Failed", value: failedExam, tone: "bg-[#f8e2e2]", percent: `${tookExam ? Math.round((failedExam / tookExam) * 100) : 0}% of examinees` },
		{ label: "Enrolled", value: enrolled, tone: "bg-[#f1ebff]", percent: `${passedExam ? Math.round((enrolled / passedExam) * 100) : 0}% of passers` },
	];

	const funnel = [
		{ label: "Applied", value: applicants, width: applicants ? "100%" : "0%", color: "bg-[#5d5ae9]" },
		{ label: "Took exam", value: tookExam, width: applicants ? `${Math.max((tookExam / applicants) * 100, 0)}%` : "0%", color: "bg-[#8d8df0]" },
		{ label: "Passed", value: passedExam, width: tookExam ? `${Math.max((passedExam / tookExam) * 100, 0)}%` : "0%", color: "bg-[#a7abea]" },
		{ label: "Enrolled", value: enrolled, width: passedExam ? `${Math.max((enrolled / passedExam) * 100, 0)}%` : "0%", color: "bg-[#dfe1ef]" },
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

					<div className="flex w-full max-w-[300px] items-center gap-2 rounded-lg border border-neutral-400 bg-white/90 px-3 py-2 shadow-sm">
						<Search className="h-4 w-4 text-neutral-500" />
						<input
							aria-label="Search"
							placeholder="Search"
							className="w-full border-0 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-500"
						/>
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
							className={`${stat.tone} rounded-xl border border-[#d7d7d7] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]`}
						>
							<div className="text-[14px] font-medium text-[#202020]">{stat.label}</div>
							<div className="mt-2 flex items-end justify-between gap-3">
								<div className="text-3xl font-bold text-[#111827]">{stat.value}</div>
								<div className="text-[11px] font-medium text-[#4b5563]">{stat.percent}</div>
							</div>
						</div>
					))}
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
					<div className="rounded-xl border border-neutral-300 bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants</div>
						<svg viewBox="0 0 420 170" className="h-[170px] w-full overflow-visible">
							<path
								d="M0 130 L35 118 L70 110 L105 120 L140 115 L175 98 L210 110 L245 96 L280 90 L315 105 L350 80 L385 95 L420 72"
								fill="none"
								stroke="#8d94b8"
								strokeWidth="2.2"
								strokeLinejoin="round"
							/>
							<path
								d="M0 130 L35 118 L70 110 L105 120 L140 115 L175 98 L210 110 L245 96 L280 90 L315 105 L350 80 L385 95 L420 72 L420 170 L0 170 Z"
								fill="rgba(143,151,194,0.08)"
							/>
							{[0, 1, 2, 3, 4, 5].map((i) => (
								<line
									key={i}
									x1="0"
									x2="420"
									y1={30 + i * 24}
									y2={30 + i * 24}
									stroke="rgba(148,163,184,0.35)"
									strokeDasharray="4 6"
								/>
							))}
							{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map(
								(label, index) => (
									<text
										key={label}
										x={30 + index * 42}
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

					<div className="rounded-xl border border-neutral-300 bg-white/80 p-3 shadow-sm">
						<div className="mb-3 text-sm font-medium text-neutral-700">Applicants</div>
						<div className="flex items-center justify-center pt-2">
							<div
								className="relative flex h-28 w-28 items-center justify-center rounded-full"
								style={{
									background: "conic-gradient(#7ca4d6 0 55%, #dfeaf8 55% 100%)",
								}}
							>
								<div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f7f7f7] text-[10px] font-semibold text-neutral-700">
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
					<div className="rounded-xl border border-neutral-300 bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission Funnel
						</div>
						<div className="space-y-3">
							{funnel.map((item) => (
								<div key={item.label} className="grid grid-cols-[110px_1fr] items-center gap-3">
									<div className="text-sm text-neutral-700">{item.label}</div>
									<div className="h-6 overflow-hidden rounded-md bg-[#ecedf3]">
										<div
											className="h-full rounded-md"
											style={{ width: item.width, backgroundColor: item.color }}
										/>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-xl border border-neutral-300 bg-white/80 p-4 shadow-sm">
						<div className="mb-4 text-lg font-semibold text-neutral-800">
							Admission quota
						</div>
						<div className="mb-2 text-3xl font-bold text-neutral-900">0</div>
						<div className="mb-4 text-sm text-neutral-600">
							of 15,000 target students
						</div>
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

export default async function DashboardPage(props: PageProps) {
	const session = await auth();
	const role = session?.user?.role;

	if (role === "GUIDANCE") {
		redirect("/guidance");
	}

	if (role === "REGISTRAR") {
		redirect("/registrar");
	}

	return <DashboardContent {...props} />;
}
