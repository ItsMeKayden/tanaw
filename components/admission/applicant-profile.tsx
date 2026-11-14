import UpdateApplicationStageForm from "@/components/admission/update-application-stage-form";

type ApplicantProfileData = {
  applicant_id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  sex: string | null;
  birth_date: Date | null;
  email: string | null;
  mobile_no: string | null;
  tbl_application: {
    application_id: number;
    application_no: string;
    application_date: Date;
    tbl_school: {
      school_name: string;
      school_type: string | null;
      city_municipality: string | null;
    } | null;
    tbl_barangay: {
      barangay_name: string;
      tbl_district: {
        district_name: string;
      } | null;
    } | null;
    tbl_branch: {
      branch_name: string;
    } | null;
    tbl_program: {
      program_code: string;
      program_name: string;
    } | null;
    tbl_admission_cycle: {
      school_year: string;
    } | null;
    tbl_admission_stage: {
      stage_id: number;
      stage_name: string;
    } | null;

    tbl_application_stage_log: {
      log_id: number;
      changed_at: Date | null;
      remarks: string | null;
      tbl_admission_stage: {
        stage_name: string;
      } | null;
      user: {
        name: string;
        email: string;
      } | null;
    }[];
  }[];
};

type AdmissionStage = {
  stage_id: number;
  stage_name: string;
};

type ApplicantProfileProps = {
  applicant: ApplicantProfileData;
  stages: AdmissionStage[];
  canUpdateStage: boolean;
};

function formatDate(date: Date | null) {
  if (!date) return "--";

  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date: Date | null) {
  if (!date) return "--";

  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "--"}</p>
    </div>
  );
}

export default function ApplicantProfile({
  applicant,
  stages,
  canUpdateStage,
}: ApplicantProfileProps) {
  const fullName = [
    applicant.first_name,
    applicant.middle_name,
    applicant.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-6">
      {/* Applicant Header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Applicant ID: {String(applicant.applicant_id).padStart(6, "0")}
            </p>
          </div>

          <span className="w-fit rounded-md bg-muted px-3 py-1 text-sm font-medium">
            Applicant Profile
          </span>
        </div>
      </div>

      {/* Personal Information */}
      <section className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <h2 className="font-semibold">Personal Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Applicant's personal and contact details.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Last Name" value={applicant.last_name} />
          <InfoRow label="First Name" value={applicant.first_name} />
          <InfoRow label="Middle Name" value={applicant.middle_name} />
          <InfoRow label="Sex" value={applicant.sex} />
          <InfoRow
            label="Birth Date"
            value={formatDate(applicant.birth_date)}
          />
          <InfoRow label="Email Address" value={applicant.email} />
          <InfoRow label="Mobile Number" value={applicant.mobile_no} />
        </div>
      </section>

      {/* Application Information */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Application Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Applications submitted by this applicant.
          </p>
        </div>

        {applicant.tbl_application.length > 0 ? (
          applicant.tbl_application.map((application, index) => (
            <div
              key={application.application_id}
              className="rounded-lg border bg-card"
            >
              <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Application {index + 1}</h3>
                  <p className="text-sm text-muted-foreground">
                    {application.application_no}
                  </p>
                </div>

                <span className="w-fit rounded-md bg-muted px-3 py-1 text-sm font-medium">
                  {application.tbl_admission_stage?.stage_name ??
                    "No Stage Assigned"}
                </span>
              </div>

              <div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {canUpdateStage && (
                  <div className="space-y-4 border-b pb-5 sm:col-span-2 lg:col-span-3">
                    <div>
                      <h4 className="font-semibold">Update Admission Stage</h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Change the current admission stage for this application.
                      </p>
                    </div>

                    <UpdateApplicationStageForm
                      applicationId={application.application_id}
                      currentStageId={
                        application.tbl_admission_stage?.stage_id ?? null
                      }
                      stages={stages}
                    />
                  </div>
                )}
                <InfoRow
                  label="Application Number"
                  value={application.application_no}
                />
                <InfoRow
                  label="Application Date"
                  value={formatDate(application.application_date)}
                />
                <InfoRow
                  label="School Year"
                  value={application.tbl_admission_cycle?.school_year ?? null}
                />
                <InfoRow
                  label="School Name"
                  value={application.tbl_school?.school_name ?? null}
                />
                <InfoRow
                  label="School Type"
                  value={application.tbl_school?.school_type ?? null}
                />
                <InfoRow
                  label="School City / Municipality"
                  value={application.tbl_school?.city_municipality ?? null}
                />
                <InfoRow
                  label="Barangay"
                  value={application.tbl_barangay?.barangay_name ?? null}
                />
                <InfoRow
                  label="District"
                  value={
                    application.tbl_barangay?.tbl_district?.district_name ??
                    null
                  }
                />
                <InfoRow
                  label="Branch"
                  value={application.tbl_branch?.branch_name ?? null}
                />
                <InfoRow
                  label="Program Code"
                  value={application.tbl_program?.program_code ?? null}
                />
                <InfoRow
                  label="Program"
                  value={application.tbl_program?.program_name ?? null}
                />

                {/* Stage History */}
                <div className="space-y-4 border-t p-5 sm:col-span-2 lg:col-span-3">
                  <div>
                    <h4 className="font-semibold">Admission Stage History</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Record of admission stage changes.
                    </p>
                  </div>

                  {application.tbl_application_stage_log.length > 0 ? (
                    <div className="space-y-4">
                      {application.tbl_application_stage_log.map((log) => (
                        <div key={log.log_id} className="rounded-md border p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-medium">
                              {log.tbl_admission_stage?.stage_name ??
                                "Unknown Stage"}
                            </p>

                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(log.changed_at)}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-muted-foreground">
                            Changed by:{" "}
                            {log.user?.name ??
                              log.user?.email ??
                              "Unknown User"}
                          </p>

                          <p className="mt-1 text-sm">
                            Remarks: {log.remarks || "--"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border p-4 text-sm text-muted-foreground">
                      No stage history available.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border p-8 text-center">
            <p className="font-medium">No applications found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This applicant does not have any associated applications yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
