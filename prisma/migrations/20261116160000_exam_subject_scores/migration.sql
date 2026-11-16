-- =====================================================================
-- Exam Scores page: per-subject (competency) scores per exam result.
-- Typed subject scores take precedence over question responses for
-- course recommendations. Additive only.
-- =====================================================================

-- CreateTable
CREATE TABLE "tbl_exam_subject_score" (
    "result_id" INTEGER NOT NULL,
    "competency_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,

    CONSTRAINT "tbl_exam_subject_score_pkey" PRIMARY KEY ("result_id","competency_id")
);

-- AddForeignKey
ALTER TABLE "tbl_exam_subject_score" ADD CONSTRAINT "tbl_exam_subject_score_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "tbl_exam_result"("result_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_subject_score" ADD CONSTRAINT "tbl_exam_subject_score_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "tbl_competency"("competency_id") ON DELETE CASCADE ON UPDATE NO ACTION;

