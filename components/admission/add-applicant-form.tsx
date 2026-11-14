"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApplicant } from "@/features/admission/actions/create-applicant";

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

type Cycle = {
  cycle_id: number;
  school_year: string;
};

type AddApplicantFormProps = {
  districts: District[];
  barangays: Barangay[];
  branches: Branch[];
  programs: Program[];
  schools: School[];
  cycles: Cycle[];
};

const steps = [
  "Personal Information",
  "Course and Campus",
  "Previous School",
  "Review",
];

const initialFormData = {
  last_name: "",
  first_name: "",
  middle_name: "",
  suffix: "",
  sex: "",
  birth_date: "",
  email: "",
  mobile_no: "",
  district_id: "",
  barangay_id: "",
  branch_id: "",
  program_id: "",
  school_id: "",
  new_school_name: "",
  new_school_type: "",
  new_school_city: "",
};

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

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function AddApplicantForm({
  districts,
  barangays,
  branches,
  programs,
  schools,
  cycles,
}: AddApplicantFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(initialFormData);
  const [schoolEntryMode, setSchoolEntryMode] = useState<"existing" | "new">(
    schools.length > 0 ? "existing" : "new",
  );
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState("");

  const formRef = useRef<HTMLFormElement>(null);

  const activeCycle = cycles[0];

  const filteredBarangays = useMemo(
    () =>
      barangays.filter(
        (barangay) => String(barangay.district_id) === formData.district_id,
      ),
    [barangays, formData.district_id],
  );

  const selectedSchool = schools.find(
    (school) => String(school.school_id) === formData.school_id,
  );

  const selectedBranch = branches.find(
    (branch) => String(branch.branch_id) === formData.branch_id,
  );

  const selectedProgram = programs.find(
    (program) => String(program.program_id) === formData.program_id,
  );

  const selectedDistrict = districts.find(
    (district) => String(district.district_id) === formData.district_id,
  );

  const selectedBarangay = barangays.find(
    (barangay) => String(barangay.barangay_id) === formData.barangay_id,
  );

  function updateField(field: keyof typeof initialFormData, value: string) {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function nextStep() {
    const currentSection = formRef.current?.querySelector(
      `[data-step="${currentStep}"]`,
    );

    if (currentSection) {
      const fields = currentSection.querySelectorAll<
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
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sections = formRef.current?.querySelectorAll("[data-step]");

    const previousSchoolSection = sections?.[2];

    if (previousSchoolSection) {
      const fields = previousSchoolSection.querySelectorAll<
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
    setSubmitError("");

    if (schoolEntryMode === "existing" && !formData.school_id) {
      setSubmitError("Please select a previous school.");
      setCurrentStep(2);
      return;
    }

    if (schoolEntryMode === "new") {
      if (
        !formData.new_school_name.trim() ||
        !formData.new_school_type ||
        !formData.new_school_city.trim()
      ) {
        setSubmitError("Please complete all new school information.");
        setCurrentStep(2);
        return;
      }
    }

    startTransition(async () => {
      try {
        const result = await createApplicant({
          ...formData,
          school_entry_mode: schoolEntryMode,
        });

        if (result.error) {
          setSubmitError(result.error);
          return;
        }

        if (result.success) {
          router.push(`/admission/applicants/${result.applicantId}`);
          router.refresh();
        }
      } catch {
        setSubmitError("Something went wrong. Please try again.");
      }
    });
  }

  function previousStep() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  const selectedSex = formData.sex || "--";

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
              Enter the applicant's personal and contact details.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Last Name *">
              <input
                required
                value={formData.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
                placeholder="Enter last name"
                className={inputClass}
              />
            </Field>

            <Field label="First Name *">
              <input
                required
                value={formData.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
                placeholder="Enter first name"
                className={inputClass}
              />
            </Field>

            <Field label="Middle Name">
              <input
                value={formData.middle_name}
                onChange={(e) => updateField("middle_name", e.target.value)}
                placeholder="Enter middle name"
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
                placeholder="example@email.com"
                className={inputClass}
              />
            </Field>

            <Field label="Mobile Number">
              <input
                type="tel"
                value={formData.mobile_no}
                onChange={(e) => updateField("mobile_no", e.target.value)}
                placeholder="09XXXXXXXXX"
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
              Select the campus and program the applicant is applying for.
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

          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm font-medium">Selected Admission Cycle</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCycle?.school_year ?? "No active admission cycle"}
            </p>
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
              Select an existing school or register a new school.
            </p>
          </div>

          <Field label="School Entry Method *">
            <select
              required
              value={schoolEntryMode}
              onChange={(e) =>
                setSchoolEntryMode(e.target.value as "existing" | "new")
              }
              className={inputClass}
            >
              <option value="existing">Select an existing school</option>
              <option value="new">Add a new school</option>
            </select>
          </Field>

          {schoolEntryMode === "existing" ? (
            <div className="space-y-4">
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

              {selectedSchool && (
                <div className="grid gap-5 rounded-md border bg-muted/30 p-4 sm:grid-cols-2">
                  <Field label="School Type">
                    <input
                      readOnly
                      value={selectedSchool.school_type ?? "--"}
                      className={`${inputClass} bg-muted`}
                    />
                  </Field>

                  <Field label="City / Municipality">
                    <input
                      readOnly
                      value={selectedSchool.city_municipality ?? "--"}
                      className={`${inputClass} bg-muted`}
                    />
                  </Field>
                </div>
              )}

              {schools.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No existing schools are registered yet. Choose "Add a new
                  school" to register one.
                </p>
              )}
            </div>
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
                    placeholder="Enter school name"
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
                  placeholder="Enter city or municipality"
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
            <h2 className="text-lg font-semibold">Review Information</h2>
            <p className="text-sm text-muted-foreground">
              Review the information before submitting the application.
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
                <ReviewItem label="Sex" value={selectedSex} />
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
                <ReviewItem
                  label="Admission Cycle"
                  value={activeCycle?.school_year}
                />
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h3 className="mb-4 font-semibold">Previous School</h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReviewItem
                  label="School Entry Method"
                  value={
                    schoolEntryMode === "existing"
                      ? "Existing School"
                      : "New School"
                  }
                />

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

            <div className="rounded-md bg-muted/50 p-4 text-sm">
              <p className="font-medium">Application Details</p>
              <p className="mt-1 text-muted-foreground">
                The application number and application date will be generated
                automatically when you submit.
              </p>
              <p className="mt-1 text-muted-foreground">
                Initial status: Application Submitted
              </p>
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

        {/* Navigation */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={currentStep === 0}
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
              {isPending ? "Submitting..." : "Submit Application"}
            </button>
          )}
        </div>
      </form>
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
