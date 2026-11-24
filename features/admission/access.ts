// Which modules share the Applicants list/profile and the Exam Schedule.
// No imports besides types, so it is safe for client and server code.
//
//   Admission  full access (add, edit, stage changes, archive / recover)
//   Registrar  view and edit (no archive)  + Exam Schedule
//   Guidance   view only
import type { ModuleName } from "@/lib/modules";

/** Modules whose pages show the Applicants list and profiles. */
export const APPLICANT_VIEW_MODULES: ModuleName[] = ["admission", "registrar", "guidance"];

/** Modules whose write access allows adding/editing applicants and changing stages. */
export const APPLICANT_EDIT_MODULES: ModuleName[] = ["admission", "registrar"];

/** Modules that show the Exam Schedule; write access manages sessions and attendance. */
export const EXAM_SCHEDULE_MODULES: ModuleName[] = ["admission", "registrar"];

/** Modules that can view the Quota page; only Admission write access can change it. */
export const QUOTA_VIEW_MODULES: ModuleName[] = ["admission", "guidance"];

/** Where each module's applicant profiles live: `${base}/[id]`. */
export const APPLICANT_BASE_PATH: Partial<Record<ModuleName, string>> = {
  admission: "/admission/applicants",
  registrar: "/registrar/applicants",
  guidance: "/guidance/applicants",
};

/** Every page that lists applicants or exam sessions (for revalidatePath after a change). */
export const APPLICANT_LIST_PATHS = ["/admission", "/registrar/applicants", "/guidance/applicants"];
export const EXAM_SCHEDULE_PATHS = ["/admission/exam/schedule", "/registrar/exam-schedule"];
