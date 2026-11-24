-- Add end_time to exam sessions so finished sessions can be distinguished from active ones.
ALTER TABLE "tbl_exam_session" ADD COLUMN "end_time" VARCHAR(5);
