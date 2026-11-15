/**
 * Applicant form schema (Zod), shared by the React Hook Form wizard on the
 * client and the create/update server actions. Safe to import anywhere.
 *
 * Fields map to the TANAW data dictionary:
 *   tbl_applicant   – name, sex, birth date, email, mobile
 *   tbl_application – barangay, branch, program (+ 2nd/3rd choice)
 *   tbl_school      – school name, type, city/municipality
 */
import { z } from "zod";

export const SCHOOL_TYPES = ["Public", "Private"] as const;
export type SchoolEntryMode = "existing" | "new";

/** Applicants must be at least this old on the day they apply. */
export const MIN_APPLICANT_AGE = 15;
export const MAX_APPLICANT_AGE = 100;

// Letters (any language, e.g. ñ), spaces, periods, apostrophes, hyphens.
const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const SUFFIX_PATTERN = /^\p{L}[\p{L} .]*$/u;
const PLACE_PATTERN = /^\p{L}[\p{L}\d .,'()-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PATTERN = /^[1-9]\d*$/;
export const MOBILE_PATTERN = /^09\d{9}$/;

/** Philippine mobile number, e.g. 09171234567 (spaces/dashes ignored). */
export function normalizeMobile(value: string) {
  return value.replace(/[\s-]/g, "");
}

function ageOn(birthDate: Date, today: Date) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

const requiredName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(100, `${label} must not exceed 100 characters.`)
    .regex(NAME_PATTERN, `${label} can only contain letters, spaces, periods, apostrophes, and hyphens.`);

const optionalName = (label: string) =>
  z
    .string()
    .trim()
    .max(100, `${label} must not exceed 100 characters.`)
    .refine((v) => !v || NAME_PATTERN.test(v), `${label} can only contain letters, spaces, periods, apostrophes, and hyphens.`);

const requiredId = (message: string) => z.string().trim().regex(ID_PATTERN, message);
const optionalId = z.string().trim().refine((v) => !v || ID_PATTERN.test(v), "Select a valid program.");

export const applicantFormSchema = z
  .object({
    // (1) Personal info
    last_name: requiredName("Last name"),
    first_name: requiredName("First name"),
    middle_name: optionalName("Middle name"),
    suffix: z
      .string()
      .trim()
      .max(20, "Suffix must not exceed 20 characters.")
      .refine((v) => !v || SUFFIX_PATTERN.test(v), "Suffix can only contain letters and periods (e.g. Jr., III)."),
    sex: z.string().refine((v) => v === "Male" || v === "Female", "Sex is required."),
    birth_date: z.string().trim().superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: "Birth date is required." });
        return;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        ctx.addIssue({ code: "custom", message: "Enter a valid birth date." });
        return;
      }
      const today = new Date();
      if (date > today) ctx.addIssue({ code: "custom", message: "Birth date cannot be in the future." });
      else if (ageOn(date, today) < MIN_APPLICANT_AGE) {
        ctx.addIssue({ code: "custom", message: `Applicant must be at least ${MIN_APPLICANT_AGE} years old.` });
      } else if (ageOn(date, today) > MAX_APPLICANT_AGE) {
        ctx.addIssue({ code: "custom", message: "Enter a realistic birth date." });
      }
    }),
    email: z
      .string()
      .trim()
      .max(150, "Email must not exceed 150 characters.")
      .refine((v) => !v || EMAIL_PATTERN.test(v), "Enter a valid email address (e.g. name@gmail.com)."),
    mobile_no: z
      .string()
      .trim()
      .refine(
        (v) => !v || MOBILE_PATTERN.test(normalizeMobile(v)),
        "Mobile number must be 11 digits starting with 09 (e.g. 0917 123 4567).",
      ),
    barangay_id: requiredId("Barangay is required."),

    // (2) Course and campus
    program_id: requiredId("1st choice program is required."),
    program_choice_2_id: optionalId,
    program_choice_3_id: optionalId,
    branch_id: requiredId("Preferred campus is required."),

    // (3) Previous school
    school_entry_mode: z.enum(["existing", "new"], {
      error: "Choose whether the school is already listed or new.",
    }),
    school_id: z.string().trim(),
    school_name: z.string().trim(),
    school_type: z.string().trim(),
    school_city: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: keyof typeof v, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // Program choices: distinct, and no 3rd choice without a 2nd.
    if (!v.program_choice_2_id && v.program_choice_3_id) {
      issue("program_choice_2_id", "Choose a 2nd choice before a 3rd choice.");
    }
    if (v.program_choice_2_id && v.program_choice_2_id === v.program_id) {
      issue("program_choice_2_id", "2nd choice must be different from your 1st choice.");
    }
    if (
      v.program_choice_3_id &&
      (v.program_choice_3_id === v.program_id || v.program_choice_3_id === v.program_choice_2_id)
    ) {
      issue("program_choice_3_id", "3rd choice must be different from your 1st and 2nd choices.");
    }

    // Previous school: pick an existing one, or describe a new one.
    if (v.school_entry_mode === "existing") {
      if (!ID_PATTERN.test(v.school_id)) issue("school_id", "Select the applicant's previous school.");
      return;
    }
    if (!v.school_name) issue("school_name", "School name is required.");
    else if (v.school_name.length < 3) issue("school_name", "School name must be at least 3 characters.");
    else if (v.school_name.length > 150) issue("school_name", "School name must not exceed 150 characters.");
    else if (!/\p{L}/u.test(v.school_name)) issue("school_name", "Enter a valid school name.");

    if (!(SCHOOL_TYPES as readonly string[]).includes(v.school_type)) {
      issue("school_type", v.school_type ? "Select a valid school type." : "School type is required.");
    }

    if (!v.school_city) issue("school_city", "City / municipality is required.");
    else if (v.school_city.length > 100) issue("school_city", "City / municipality must not exceed 100 characters.");
    else if (!PLACE_PATTERN.test(v.school_city)) issue("school_city", "Enter a valid city or municipality.");
  });

/** The raw form values (all strings, as typed in the inputs). */
export type ApplicantFormValues = z.input<typeof applicantFormSchema>;
export type ApplicantFormField = keyof ApplicantFormValues;
export type ApplicantFieldErrors = Partial<Record<ApplicantFormField, string>>;

export const emptyApplicantForm: ApplicantFormValues = {
  last_name: "",
  first_name: "",
  middle_name: "",
  suffix: "",
  sex: "",
  birth_date: "",
  email: "",
  mobile_no: "",
  barangay_id: "",
  program_id: "",
  program_choice_2_id: "",
  program_choice_3_id: "",
  branch_id: "",
  school_entry_mode: "existing",
  school_id: "",
  school_name: "",
  school_type: "",
  school_city: "",
};

export const APPLICANT_FORM_FIELDS = Object.keys(emptyApplicantForm) as ApplicantFormField[];

/** First message per field from a failed parse (for server-side errors). */
export function fieldErrorsFrom(error: z.ZodError): ApplicantFieldErrors {
  const errors: ApplicantFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ApplicantFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
