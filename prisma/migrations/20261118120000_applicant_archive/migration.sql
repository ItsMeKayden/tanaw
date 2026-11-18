-- =====================================================================
-- Applicant archive: deleting an applicant now archives it instead.
-- Archived applicants can be recovered from Archive History; records
-- archived for over a year are purged by the application. Additive only.
-- =====================================================================

-- AlterTable
ALTER TABLE "tbl_applicant" ADD COLUMN "archived_at" TIMESTAMP(6),
ADD COLUMN "archived_by" INTEGER;

-- CreateIndex
CREATE INDEX "tbl_applicant_archived_at_idx" ON "tbl_applicant"("archived_at");

-- AddForeignKey
ALTER TABLE "tbl_applicant" ADD CONSTRAINT "tbl_applicant_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
