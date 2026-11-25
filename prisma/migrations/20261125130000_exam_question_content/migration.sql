-- Question text and multiple-choice options (A–D). Optional, so answer-key-only
-- questions (and existing imports) keep working.
ALTER TABLE "tbl_exam_question" ADD COLUMN "question_text" TEXT,
ADD COLUMN "choice_a" VARCHAR(500),
ADD COLUMN "choice_b" VARCHAR(500),
ADD COLUMN "choice_c" VARCHAR(500),
ADD COLUMN "choice_d" VARCHAR(500);
