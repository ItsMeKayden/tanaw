-- House no. / street / subdivision, asked on the applicant form with the barangay.
-- Nullable: applications made before this field have none.
ALTER TABLE "tbl_application" ADD COLUMN "street_address" VARCHAR(150);
