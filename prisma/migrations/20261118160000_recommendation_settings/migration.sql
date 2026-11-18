-- =====================================================================
-- Course Recommendation settings: per-course minimum match (replaces the
-- fixed 70%) and an on/off switch for generating recommendations.
-- Additive only; existing courses get 70.
-- =====================================================================

-- AlterTable
ALTER TABLE "tbl_program" ADD COLUMN "min_match" DECIMAL(5,2) NOT NULL DEFAULT 70;
-- CreateTable
CREATE TABLE "tbl_recommendation_setting" (
    "setting_id" SERIAL NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_recommendation_setting_pkey" PRIMARY KEY ("setting_id")
);
-- AddForeignKey
ALTER TABLE "tbl_recommendation_setting" ADD CONSTRAINT "tbl_recommendation_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
