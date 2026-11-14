// Shared applicant/course selection for the breakdown and comparison pages.
import { resolveCycle } from "@/features/admission/admission-stats";
import {
  getApplicationRecommendation,
  getRecommendedApplicants,
} from "@/features/recommendation/queries";

type Params = { application?: string | string[]; program?: string | string[]; cycle?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Picks the application from ?application= (default: first scored applicant
 * of the active cycle) and the course from ?program= (default given by the
 * caller, e.g. the preferred or top recommended course).
 */
export async function resolveSelection(
  params: Params,
  defaultProgram: "preferred" | "recommended",
) {
  const requestedApplication = Number(first(params.application));
  const requestedProgram = Number(first(params.program));

  let data =
    Number.isSafeInteger(requestedApplication) && requestedApplication > 0
      ? await getApplicationRecommendation(requestedApplication)
      : null;

  const { cycle } = await resolveCycle(
    first(params.cycle) ?? (data?.cycle_id ? String(data.cycle_id) : undefined),
  );
  const applicants = cycle ? await getRecommendedApplicants(cycle.cycle_id) : [];

  if (!data && applicants[0]) {
    data = await getApplicationRecommendation(applicants[0].application_id);
  }

  // Keep the current applicant in the picker even if it is from another cycle.
  if (data && !applicants.some((a) => a.application_id === data!.application_id)) {
    applicants.unshift({ application_id: data.application_id, label: `${data.full_name} (${data.application_no})` });
  }

  const programs = data?.programs.filter((p) => p.weights.some((w) => w.weight > 0)) ?? [];
  const fallbackId =
    defaultProgram === "preferred"
      ? (data?.preferred?.program_id ?? data?.ranking[0]?.program_id)
      : (data?.ranking[0]?.program_id ?? data?.preferred?.program_id);

  const program =
    programs.find((p) => p.program_id === requestedProgram) ??
    programs.find((p) => p.program_id === fallbackId) ??
    programs[0] ??
    null;

  return { data, applicants, programs, program };
}
