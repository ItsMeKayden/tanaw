-- Exam sets: Set B is a copy of Set A with reshuffled choices; each exam
-- session takes one set. Existing questions and sessions are Set A.
ALTER TABLE "tbl_exam_question" ADD COLUMN "set_label" VARCHAR(5) NOT NULL DEFAULT 'A';
CREATE INDEX "tbl_exam_question_exam_id_set_label_idx" ON "tbl_exam_question"("exam_id", "set_label");

ALTER TABLE "tbl_exam_session" ADD COLUMN "exam_set" VARCHAR(5) NOT NULL DEFAULT 'A';

-- Questions lock after the exam date; Admission can unlock them for editing.
ALTER TABLE "tbl_exam" ADD COLUMN "edit_unlocked" BOOLEAN NOT NULL DEFAULT false;
