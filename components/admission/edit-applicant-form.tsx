"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplicant } from "@/features/admission/actions/update-applicant";

type District = {
  district_id: number;
  district_name: string;
};

type Barangay = {
  barangay_id: number;
  barangay_name: string;
  district_id: number | null;
};

type Branch = {
  branch_id: number;
  branch_name: string;
  branch_code: string;
};

type Program = {
  program_id: number;
  program_name: string;
  program_code: string;
};

type School = {
  school_id: number;
  school_name: string;
  school_type: string | null;
  city_municipality: string | null;
};

type InitialData = {
  applicant_id: number;
  application_id: number;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  sex: string;
  birth_date: string;
  email: string;
  mobile_no: string;
  district_id: string;
  barangay_id: string;
  branch_id: string;
  program_id: string;
  school_id: string;
};

type Props = {
  initialData: InitialData;
  districts: District[];
  barangays: Barangay[];
  branches: Branch[];
  programs: Program[];
  schools: School[];
};

const steps = [
  "Personal Information",
  "Course and Campus",
  "Previous School",
  "Review",
];

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "--"}</p>
    </div>
  );
}

export default function EditApplicantForm({
  initialData,
  districts,
  barangays,
  branches,
  programs,
  schools,
}: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    ...initialData,
    new_school_name: "",
    new_school_type: "",
    new_school_city: "",
  });

  const [schoolEntryMode, setSchoolEntryMode] = useState<"existing" | "new">(
    initialData.school_id ? "existing" : "new",
  );

  const [submitError, setSubmitError] = useState("");
  const [isPending, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const filteredBarangays = useMemo(
    () =>
      barangays.filter(
        (barangay) => String(barangay.district_id) === formData.district_id,
      ),
    [barangays, formData.district_id],
  );

  const selectedDistrict = districts.find(
    (item) => String(item.district_id) === formData.district_id,
  );

  const selectedBarangay = barangays.find(
    (item) => String(item.barangay_id) === formData.barangay_id,
  );

  const selectedBranch = branches.find(
    (item) => String(item.branch_id) === formData.branch_id,
  );

  const selectedProgram = programs.find(
    (item) => String(item.program_id) === formData.program_id,
  );

  const selectedSchool = schools.find(
    (item) => String(item.school_id) === formData.school_id,
  );

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function nextStep() {
    const section = formRef.current?.querySelector(
      `[data-step="${currentStep}"]`,
    );

    if (section) {
      const fields = section.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("input, select");

      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return;
        }
      }
    }

    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
    setSubmitError("");
  }

  function previousStep() {
    setCurrentStep((step) => Math.max(step - 1, 0));
    setSubmitError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    const schoolSection = formRef.current?.querySelector('[data-step="2"]');

    if (schoolSection) {
      const fields = schoolSection.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("input, select");

      for (const field of fields) {
        if (!field.checkValidity()) {
          setCurrentStep(2);
          field.reportValidity();
          return;
        }
      }
    }

    startTransition(async () => {
      try {
        const result = await updateApplicant({
          ...formData,
          school_entry_mode: schoolEntryMode,
        });

        if (result.error) {
          setSubmitError(result.error);
          return;
        }

        if (result.success) {
          router.push(`/admission/applicants/${initialData.applicant_id}`);
          router.refresh();
        }
      } catch {
        setSubmitError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="rounded-lg border bg-card p-5">
        <div className="grid grid-cols-4 gap-2">
          {steps.map((step, index) => (
            <div key={step} className="space-y-2">
              <div
                className={`h-2 rounded-full ${
                  index <= currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
              <p
                className={`text-xs ${
                  index === currentStep
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {index + 1}. {step}
              </p>
            </div>
          ))}
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        {/* SECTION 1: PERSONAL INFORMATION */}
        <section
          data-step="0"
          hidden={currentStep !== 0}
          className="space-y-6 rounded-lg border bg-card p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">Personal Information</h2>
            <p className="text-sm text-muted-foreground">
              Update the applicant's personal and contact details.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Last Name *">
              <input
                required
                value={formData.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="First Name *">
              <input
                required
                value={formData.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Middle Name">
              <input
                value={formData.middle_name}
                onChange={(e) => updateField("middle_name", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Suffix">
              <input
                value={formData.suffix}
                onChange={(e) => updateField("suffix", e.target.value)}
                placeholder="e.g. Jr., Sr., III"
                maxLength={20}
                className={inputClass}
              />
            </Field>

            <Field label="Sex *">
              <select
                required
                value={formData.sex}
                onChange={(e) => updateField("sex", e.target.value)}
                className={inputClass}
              >
                <option value="">Select sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </Field>

            <Field label="Birth Date *">
              <input
                required
                type="date"
                value={formData.birth_date}
                onChange={(e) => updateField("birth_date", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Email Address">
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Mobile Number">
              <input
                type="tel"
                value={formData.mobile_no}
                onChange={(e) => updateField("mobile_no", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="border-t pt-5">
            <h3 className="mb-4 font-semibold">Address Information</h3>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="District *">
                <select
                  required
                  value={formData.district_id}
                  onChange={(e) => {
                    setFormData((previous) => ({
                      ...previous,
                      district_id: e.target.value,
                      barangay_id: "",
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Select district</option>
                  {districts.map((district) => (
                    <option
                      key={district.district_id}
                      value={district.district_id}
                    >
                      {district.district_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Barangay *">
                <select
                  required
                  value={formData.barangay_id}
                  onChange={(e) => updateField("barangay_id", e.target.value)}
                  disabled={!formData.district_id}
                  className={inputClass}
                >
                  <option value="">Select barangay</option>
                  {filteredBarangays.map((barangay) => (
                    <option
                      key={barangay.barangay_id}
                      value={barangay.barangay_id}
                    >
                      {barangay.barangay_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        {/* SECTION 2: COURSE AND CAMPUS */}
        <section
          data-step="1"
          hidden={currentStep !== 1}
          className="space-y-6 rounded-lg border bg-card p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">Course and Campus</h2>
            <p className="text-sm text-muted-foreground">
              Update the applicant's campus and program.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Campus / Branch *">
              <select
                required
                value={formData.branch_id}
                onChange={(e) => updateField("branch_id", e.target.value)}
                className={inputClass}
              >
                <option value="">Select campus</option>
                {branches.map((branch) => (
                  <option key={branch.branch_id} value={branch.branch_id}>
                    {branch.branch_name} ({branch.branch_code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Course / Program *">
              <select
                required
                value={formData.program_id}
                onChange={(e) => updateField("program_id", e.target.value)}
                className={inputClass}
              >
                <option value="">Select program</option>
                {programs.map((program) => (
                  <option key={program.program_id} value={program.program_id}>
                    {program.program_code} - {program.program_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* SECTION 3: PREVIOUS SCHOOL */}
        <section
          data-step="2"
          hidden={currentStep !== 2}
          className="space-y-6 rounded-lg border bg-card p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">Previous School</h2>
            <p className="text-sm text-muted-foreground">
              Update the previous school information.
            </p>
          </div>

          <Field label="School Entry Method *">
            <select
              required
              value={schoolEntryMode}
              onChange={(e) => {
                setSchoolEntryMode(e.target.value as "existing" | "new");
                setSubmitError("");
              }}
              className={inputClass}
            >
              <option value="existing">Select an existing school</option>
              <option value="new">Add a new school</option>
            </select>
          </Field>

          {schoolEntryMode === "existing" ? (
            <Field label="Previous School *">
              <select
                required
                value={formData.school_id}
                onChange={(e) => updateField("school_id", e.target.value)}
                className={inputClass}
              >
                <option value="">Select previous school</option>
                {schools.map((school) => (
                  <option key={school.school_id} value={school.school_id}>
                    {school.school_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid gap-5 rounded-md border p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="School Name *">
                  <input
                    required
                    value={formData.new_school_name}
                    onChange={(e) =>
                      updateField("new_school_name", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="School Type *">
                <select
                  required
                  value={formData.new_school_type}
                  onChange={(e) =>
                    updateField("new_school_type", e.target.value)
                  }
                  className={inputClass}
                >
                  <option value="">Select school type</option>
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              <Field label="City / Municipality *">
                <input
                  required
                  value={formData.new_school_city}
                  onChange={(e) =>
                    updateField("new_school_city", e.target.value)
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </section>

        {/* SECTION 4: REVIEW */}
        <section
          data-step="3"
          hidden={currentStep !== 3}
          className="space-y-6 rounded-lg border bg-card p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">Review Changes</h2>
            <p className="text-sm text-muted-foreground">
              Review the updated information before saving.
            </p>
          </div>

          <div className="space-y-5">
            <div className="rounded-md border p-4">
              <h3 className="mb-4 font-semibold">Personal Information</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReviewItem label="Last Name" value={formData.last_name} />
                <ReviewItem label="First Name" value={formData.first_name} />
                <ReviewItem label="Middle Name" value={formData.middle_name} />
                <ReviewItem label="Suffix" value={formData.suffix} />
                <ReviewItem label="Sex" value={formData.sex} />
                <ReviewItem label="Birth Date" value={formData.birth_date} />
                <ReviewItem label="Email" value={formData.email} />
                <ReviewItem label="Mobile Number" value={formData.mobile_no} />
                <ReviewItem
                  label="District"
                  value={selectedDistrict?.district_name}
                />
                <ReviewItem
                  label="Barangay"
                  value={selectedBarangay?.barangay_name}
                />
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h3 className="mb-4 font-semibold">Course and Campus</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewItem
                  label="Campus / Branch"
                  value={selectedBranch?.branch_name}
                />
                <ReviewItem
                  label="Course / Program"
                  value={selectedProgram?.program_name}
                />
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h3 className="mb-4 font-semibold">Previous School</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewItem
                  label="School Name"
                  value={
                    schoolEntryMode === "existing"
                      ? selectedSchool?.school_name
                      : formData.new_school_name
                  }
                />
                <ReviewItem
                  label="School Type"
                  value={
                    schoolEntryMode === "existing"
                      ? selectedSchool?.school_type
                      : formData.new_school_type
                  }
                />
                <ReviewItem
                  label="City / Municipality"
                  value={
                    schoolEntryMode === "existing"
                      ? selectedSchool?.city_municipality
                      : formData.new_school_city
                  }
                />
              </div>
            </div>
          </div>
        </section>

        {submitError && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {submitError}
          </div>
        )}

        {/* NAVIGATION */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={currentStep === 0 || isPending}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            Previous
          </button>

          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
