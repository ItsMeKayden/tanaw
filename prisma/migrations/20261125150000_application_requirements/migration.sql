-- Requirements verified by staff (Form 138, PSA birth certificate, ...).
-- Verifying every required one moves the applicant to "For Examination".
CREATE TABLE "tbl_application_requirement" (
    "application_id" INTEGER NOT NULL,
    "requirement" VARCHAR(50) NOT NULL,
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_requirement_pkey" PRIMARY KEY ("application_id","requirement")
);

ALTER TABLE "tbl_application_requirement" ADD CONSTRAINT "tbl_application_requirement_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "tbl_application_requirement" ADD CONSTRAINT "tbl_application_requirement_verified_by_fkey"
    FOREIGN KEY ("verified_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Log changes in the audit trail like every other table.
SELECT tanaw_audit_attach('"tbl_application_requirement"'::regclass);
