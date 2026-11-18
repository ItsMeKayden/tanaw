-- =====================================================================
-- Compatibility rules (advisory): optional minimum subject score per
-- course, and the subjects each generated recommendation falls short on.
-- Additive only; existing courses have no rules.
-- =====================================================================

-- AlterTable
ALTER TABLE "tbl_course_recommendation" ADD COLUMN "unmet_competency_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
-- AlterTable
ALTER TABLE "tbl_program_competency" ADD COLUMN "min_score" DECIMAL(5,2);
