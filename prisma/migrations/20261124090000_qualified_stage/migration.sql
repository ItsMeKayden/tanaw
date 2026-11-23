-- Waiting list for additional admission batches: applicants who pass the exam
-- after their course's quota is full go to "Qualified" instead of "Passed",
-- and are admitted from the Additional Applicants page when slots open.

UPDATE "tbl_admission_stage" SET "stage_order" = 6 WHERE "stage_name" = 'Failed';
UPDATE "tbl_admission_stage" SET "stage_order" = 7 WHERE "stage_name" = 'Enrolled';
UPDATE "tbl_admission_stage" SET "stage_order" = 8 WHERE "stage_name" = 'Not Enrolled';

INSERT INTO "tbl_admission_stage" ("stage_name", "stage_order")
SELECT 'Qualified', 5
WHERE NOT EXISTS (SELECT 1 FROM "tbl_admission_stage" WHERE "stage_name" = 'Qualified');
