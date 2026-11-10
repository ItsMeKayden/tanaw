-- DropForeignKey
ALTER TABLE "tbl_application_stage_log" DROP CONSTRAINT "tbl_application_stage_log_changed_by_fkey";

-- AlterTable
ALTER TABLE "tbl_application_stage_log" ALTER COLUMN "changed_by" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "tbl_application_stage_log" ADD CONSTRAINT "tbl_application_stage_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
