// Display rules for the Audit Log page. Type-only imports — safe for client code.
import type { AuditChange } from "@/features/audit-log/queries";

export const AUDIT_ACTIONS = {
  INSERT: { label: "Created", verb: "created", tone: "green" },
  UPDATE: { label: "Updated", verb: "updated", tone: "blue" },
  DELETE: { label: "Deleted", verb: "deleted", tone: "red" },
  TRUNCATE: { label: "Cleared", verb: "cleared all", tone: "red" },
  LOGIN: { label: "Signed in", verb: "signed in", tone: "neutral" },
  LOGIN_FAILED: { label: "Failed sign-in", verb: "failed to sign in", tone: "amber" },
  LOGOUT: { label: "Signed out", verb: "signed out", tone: "neutral" },
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export type Tone = (typeof AUDIT_ACTIONS)[AuditAction]["tone"];

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  green: { badge: "border-green-300 bg-green-50 text-green-800", dot: "bg-green-600" },
  blue: { badge: "border-blue-300 bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  red: { badge: "border-red-300 bg-red-50 text-red-800", dot: "bg-red-600" },
  amber: { badge: "border-amber-300 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  neutral: { badge: "border-neutral-300 bg-neutral-100 text-neutral-800", dot: "bg-neutral-500" },
};

export function actionInfo(action: string) {
  return AUDIT_ACTIONS[action as AuditAction] ?? { label: action, verb: action.toLowerCase(), tone: "neutral" as const };
}

/** Modules of the app, used to group record types. */
export const AUDIT_MODULES = [
  "Admission",
  "Exams",
  "Course Recommendation",
  "User Management",
  "Account",
  // Seed-only data (campuses, barangays, districts) and unknown tables; not offered as a filter.
  "Other",
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

type TableInfo = {
  label: string;
  module: AuditModule;
  /** Lower = more important; picks the headline of a multi-record save. */
  rank: number;
};

/** Every audited table, in the words used on the app's pages. */
export const AUDIT_TABLES: Record<string, TableInfo> = {
  tbl_applicant: { label: "Applicant", module: "Admission", rank: 1 },
  tbl_application: { label: "Application", module: "Admission", rank: 2 },
  tbl_application_document: { label: "Document", module: "Admission", rank: 5 },
  tbl_application_stage_log: { label: "Status change", module: "Admission", rank: 8 },
  tbl_quota: { label: "Quota", module: "Admission", rank: 3 },
  tbl_admission_cycle: { label: "Admission cycle", module: "Admission", rank: 3 },
  tbl_admission_stage: { label: "Admission stage", module: "Admission", rank: 4 },
  tbl_exam: { label: "Exam", module: "Exams", rank: 3 },
  tbl_exam_session: { label: "Exam session", module: "Exams", rank: 3 },
  tbl_exam_session_applicant: { label: "Exam seat", module: "Exams", rank: 4 },
  tbl_exam_result: { label: "Exam result", module: "Exams", rank: 4 },
  tbl_exam_subject_score: { label: "Subject score", module: "Exams", rank: 6 },
  tbl_exam_question: { label: "Exam question", module: "Exams", rank: 6 },
  tbl_question_response: { label: "Exam answer", module: "Exams", rank: 7 },
  tbl_import_batch: { label: "Score import", module: "Exams", rank: 3 },
  tbl_passing_score_setting: { label: "Passing score", module: "Exams", rank: 3 },
  tbl_course_recommendation: { label: "Course recommendation", module: "Course Recommendation", rank: 7 },
  tbl_recommendation_setting: { label: "Recommendation settings", module: "Course Recommendation", rank: 3 },
  tbl_program: { label: "Course", module: "Course Recommendation", rank: 3 },
  tbl_program_competency: { label: "Course subject weight", module: "Course Recommendation", rank: 4 },
  tbl_competency: { label: "Subject", module: "Course Recommendation", rank: 4 },
  tbl_school: { label: "School", module: "Admission", rank: 4 },
  tbl_branch: { label: "Branch", module: "Other", rank: 4 },
  tbl_barangay: { label: "Barangay", module: "Other", rank: 4 },
  tbl_district: { label: "District", module: "Other", rank: 4 },
  tbl_user_account: { label: "User account", module: "User Management", rank: 2 },
  tbl_role: { label: "Role", module: "User Management", rank: 3 },
  tbl_permission: { label: "Permission", module: "User Management", rank: 4 },
  tbl_role_permission: { label: "Role access", module: "User Management", rank: 5 },
  tbl_password_reset_token: { label: "Password reset link", module: "Account", rank: 6 },
  User: { label: "Legacy user", module: "User Management", rank: 6 },
};

export function tableInfo(table: string | null): TableInfo {
  if (!table) return { label: "Account", module: "Account", rank: 9 };
  return (
    AUDIT_TABLES[table] ?? {
      label: fieldLabel(table.replace(/^tbl_/, "")),
      module: "Other",
      rank: 9,
    }
  );
}

/** Field names that read better spelled out. */
const FIELD_NAMES: Record<string, string> = {
  program_id: "Course (1st choice)",
  program_choice_2_id: "Course (2nd choice)",
  program_choice_3_id: "Course (3rd choice)",
  current_stage_id: "Status",
  stage_id: "Status",
  school_id: "Previous school",
  competency_id: "Subject",
  cycle_id: "Admission cycle",
  application_no: "Application no.",
  mobile_no: "Mobile no.",
  password_hash: "Password",
  token_hash: "Reset token",
  file_data: "File",
  boundary_geojson: "Map boundary",
  is_active: "Active",
  is_enabled: "Enabled",
  is_correct: "Correct",
  min_match: "Minimum match (%)",
  min_score: "Minimum score (%)",
  compatibility_score: "Match (%)",
  rank_no: "Rank",
  unmet_competency_ids: "Unmet subjects",
  quota_slots: "Slots",
  display_name: "Display name",
  role_name: "Role code",
  changed_by: "Changed by",
  updated_by: "Updated by",
  uploaded_by: "Uploaded by",
  created_by: "Created by",
  marked_by: "Marked by",
  archived_by: "Archived by",
  imported_by: "Imported by",
  user_id: "User",
  role_id: "Role",
  permission_id: "Permission",
  result_id: "Exam result",
  session_id: "Exam session",
};

/** "school_type" → "School type"; foreign keys drop their "id". */
export function fieldLabel(field: string) {
  if (FIELD_NAMES[field]) return FIELD_NAMES[field];
  const text = field.replace(/_id$/, "").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Primary/foreign key columns that are only shown when nothing better is known. */
export function isIdField(field: string) {
  return field.endsWith("_id");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Plain dates ("2026-11-23") are shown as written. Date-times are stored in
 * UTC by the app (Prisma writes UTC), so they are shown in Philippine time.
 */
function formatStoredDate(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+)?$/.exec(text);
  if (!match) return text;
  const [, y, m, d, time] = match;
  if (!time || /^T00:00(:00(\.0+)?)?$/.test(time)) return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
  const instant = new Date(`${y}-${m}-${d}${time}Z`);
  return Number.isNaN(instant.getTime()) ? text : dateTimeFormat.format(instant);
}

/** Name of the record a foreign-key value points to, if the log resolved it. */
export function refName(change: Pick<AuditChange, "refs">, field: string, value: unknown) {
  if (value === null || value === undefined) return undefined;
  return change.refs?.[`${field}:${String(value)}`];
}

/** One field value as text, using linked record names where known. */
export function formatValue(value: unknown, refName?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (refName) return refName;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((v) => formatValue(v)).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (text.startsWith("[hidden")) return "•••••• (hidden)";
  if (text.startsWith("[omitted")) return "(file not shown)";
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(text)) return formatStoredDate(text);
  return text;
}

/** "Mozilla/5.0 (Windows NT 10.0…) … Chrome/131…" → "Chrome on Windows". */
// Checked in order: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

export function browserName(userAgent: string | null) {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (!browser && !os) return userAgent.split(" ")[0];
  return [browser ?? "Browser", os].filter(Boolean).join(" on ");
}

/** Avatar colour per role. */
export const ROLE_COLORS: Record<string, string> = {
  SYSTEM_ADMIN: "bg-[#191e73] text-white",
  PRESIDENT: "bg-purple-700 text-white",
  ADMISSION: "bg-blue-600 text-white",
  REGISTRAR: "bg-teal-600 text-white",
  GUIDANCE: "bg-amber-600 text-white",
};

export function initials(name: string | null) {
  if (!name) return "SYS";
  const parts = name.replace(/\([^)]*\)/, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/**
 * Plain-language description of one change: "gave Registrar write access to
 * Recommendation", "recovered applicant Juan Dela Cruz from the archive".
 * Rendered as: <actor> {verb} <strong>{subject}</strong>{suffix}
 */
export type ChangeDescription = {
  badge: string;
  tone: Tone;
  verb: string;
  subject: string | null;
  suffix?: string;
};

function after(change: AuditChange, field: string) {
  return change.new_data?.[field] ?? null;
}
function changed(change: AuditChange, field: string) {
  return change.action === "UPDATE" && change.changed_fields.includes(field);
}
function ref(change: AuditChange, field: string, side: "old" | "new" = "new") {
  const data = side === "old" ? change.old_data : change.new_data;
  return refName(change, field, data?.[field]);
}

export function describeChange(change: AuditChange): ChangeDescription {
  const info = actionInfo(change.action);
  const table = tableInfo(change.table_name);
  const subject = change.record_label ?? (change.record_id ? `#${change.record_id}` : null);
  const generic: ChangeDescription = {
    badge: info.label,
    tone: info.tone,
    verb: change.table_name ? `${info.verb} ${table.label.toLowerCase()}` : info.verb,
    subject: change.table_name ? subject : null,
  };

  switch (change.table_name) {
    case "tbl_role_permission": {
      const data = change.new_data ?? change.old_data;
      const role = refName(change, "role_id", data?.role_id) ?? "a role";
      const permission = refName(change, "permission_id", data?.permission_id) ?? "a module";
      const [, module = permission, level = ""] = /^(.*) \((\w+)\)$/.exec(permission) ?? [];
      const access = ` ${level ? level + " " : ""}access to ${module}`;
      if (change.action === "INSERT") {
        return { badge: "Access granted", tone: "green", verb: "gave", subject: role, suffix: access };
      }
      if (change.action === "DELETE") {
        return { badge: "Access removed", tone: "red", verb: "removed", subject: `${role}’s`, suffix: access };
      }
      break;
    }
    case "tbl_applicant":
      if (isRecovery(change)) {
        return { badge: "Recovered", tone: "green", verb: "recovered applicant", subject, suffix: " from the archive" };
      }
      if (changed(change, "archived_at")) {
        return { badge: "Archived", tone: "amber", verb: "archived applicant", subject };
      }
      break;
    case "tbl_user_account": {
      const name = (change.new_data ?? change.old_data)?.full_name;
      const who = typeof name === "string" ? name : subject;
      if (change.action === "INSERT") {
        return { badge: "Account created", tone: "green", verb: "created the account of", subject: who };
      }
      if (changed(change, "is_active")) {
        return after(change, "is_active")
          ? { badge: "Activated", tone: "green", verb: "reactivated the account of", subject: who }
          : { badge: "Deactivated", tone: "red", verb: "deactivated the account of", subject: who };
      }
      if (changed(change, "role_id")) {
        const role = ref(change, "role_id");
        return { badge: "Role changed", tone: "blue", verb: "changed the role of", subject: who, suffix: role ? ` to ${role}` : undefined };
      }
      if (changed(change, "password_hash") && change.changed_fields.length === 1) {
        return { badge: "Password changed", tone: "amber", verb: "changed the password of", subject: who };
      }
      break;
    }
    case "tbl_application":
      if (changed(change, "current_stage_id")) {
        const stage = ref(change, "current_stage_id");
        return {
          badge: "Status changed",
          tone: "blue",
          verb: "moved application",
          subject,
          suffix: stage ? ` to “${stage}”` : undefined,
        };
      }
      break;
    case "tbl_exam_session_applicant": {
      const app = ref(change, "application_id") ?? subject;
      if (changed(change, "attendance")) {
        const mark = after(change, "attendance");
        return {
          badge: "Attendance",
          tone: "blue",
          verb: "marked",
          subject: app,
          suffix: typeof mark === "string" ? ` as ${mark.toLowerCase()}` : " as not yet marked",
        };
      }
      if (change.action === "INSERT") return { badge: "Seat assigned", tone: "green", verb: "gave", subject: app, suffix: " an exam seat" };
      if (change.action === "DELETE") return { badge: "Seat removed", tone: "red", verb: "removed", subject: app, suffix: " from an exam session" };
      break;
    }
    case "tbl_application_document":
      if (change.action === "INSERT") return { ...generic, badge: "Uploaded", verb: "uploaded document" };
      break;
  }
  return generic;
}

/** An applicant taken out of Archive History (archived_at cleared). */
export function isRecovery(change: AuditChange) {
  return (
    change.table_name === "tbl_applicant" &&
    change.action === "UPDATE" &&
    change.changed_fields.includes("archived_at") &&
    (change.new_data?.archived_at ?? null) === null
  );
}
