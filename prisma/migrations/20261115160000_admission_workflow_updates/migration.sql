-- =====================================================================
-- Admission workflow updates
--   1. Rename stage "For Evaluation" → "Passed"
--   2. Stage log author (changed_by) → tbl_user_account.user_id
--   3. "Not Enrolled" admission stage
--   4. 2nd / 3rd program choices on tbl_application
--   5. tbl_application_document (uploaded Form 138 / PSA)
--
-- Safe on both a fresh database and one already holding data.
-- Stage rows for a fresh database are created by `npm run db:seed`.
-- =====================================================================


-- 1. Applicants with a PASSED exam result sit in this stage; only the
--    label changes (stage_id is preserved).
UPDATE "tbl_admission_stage"
SET "stage_name" = 'Passed'
WHERE "stage_name" = 'For Evaluation'
  AND NOT EXISTS (SELECT 1 FROM "tbl_admission_stage" WHERE "stage_name" = 'Passed');


-- 2. Repoint tbl_application_stage_log.changed_by from the legacy "User"
--    table (TEXT cuid) to tbl_user_account.user_id (INTEGER), as in the
--    data dictionary. Existing authors are mapped by email; authors with
--    no matching account become NULL.
ALTER TABLE "tbl_application_stage_log" DROP CONSTRAINT IF EXISTS "tbl_application_stage_log_changed_by_fkey";

ALTER TABLE "tbl_application_stage_log" ADD COLUMN "changed_by_account" INTEGER;

UPDATE "tbl_application_stage_log" AS l
SET "changed_by_account" = a."user_id"
FROM "User" AS u
INNER JOIN "tbl_user_account" AS a
    ON LOWER(a."email") = LOWER(u."email")
WHERE l."changed_by" = u."id";

ALTER TABLE "tbl_application_stage_log" DROP COLUMN "changed_by";

ALTER TABLE "tbl_application_stage_log" RENAME COLUMN "changed_by_account" TO "changed_by";

ALTER TABLE "tbl_application_stage_log" ADD CONSTRAINT "tbl_application_stage_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 3. Admitted applicants who declined or did not enroll. Only added when
--    the stage list already exists (a fresh database gets it from the seed).
INSERT INTO "tbl_admission_stage" ("stage_name", "stage_order")
SELECT 'Not Enrolled', MAX("stage_order") + 1
FROM "tbl_admission_stage"
HAVING COUNT(*) > 0
   AND NOT EXISTS (SELECT 1 FROM "tbl_admission_stage" WHERE "stage_name" = 'Not Enrolled');


-- 4. Program choices (program_id remains the 1st choice).
ALTER TABLE "tbl_application" ADD COLUMN "program_choice_2_id" INTEGER,
ADD COLUMN "program_choice_3_id" INTEGER;

ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_program_choice_2_id_fkey" FOREIGN KEY ("program_choice_2_id") REFERENCES "tbl_program"("program_id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_program_choice_3_id_fkey" FOREIGN KEY ("program_choice_3_id") REFERENCES "tbl_program"("program_id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- 5. Uploaded application documents.
CREATE TABLE "tbl_application_document" (
    "document_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "uploaded_by" INTEGER,
    "document_type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_data" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_document_pkey" PRIMARY KEY ("document_id")
);

CREATE UNIQUE INDEX "tbl_application_document_application_id_document_type_key" ON "tbl_application_document"("application_id", "document_type");

ALTER TABLE "tbl_application_document" ADD CONSTRAINT "tbl_application_document_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "tbl_application_document" ADD CONSTRAINT "tbl_application_document_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
