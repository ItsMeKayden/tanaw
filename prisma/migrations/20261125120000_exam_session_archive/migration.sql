-- Exam sessions are archived (and can be restored) instead of deleted.
ALTER TABLE "tbl_exam_session" ADD COLUMN "archived_at" TIMESTAMP(6),
ADD COLUMN "archived_by" INTEGER;

CREATE INDEX "tbl_exam_session_archived_at_idx" ON "tbl_exam_session"("archived_at");
