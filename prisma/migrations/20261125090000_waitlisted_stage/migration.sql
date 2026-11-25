-- Renames the "Qualified" stage (the waiting list for applicants who pass after
-- their course's quota is full) to "Waitlisted", which says what it means.
-- The row keeps its stage_id, so applications and stage history follow it.

-- If both rows exist (e.g. a seed already created "Waitlisted"), move
-- everything onto "Waitlisted" and drop "Qualified".
UPDATE "tbl_application" a
   SET "current_stage_id" = w."stage_id"
  FROM "tbl_admission_stage" q, "tbl_admission_stage" w
 WHERE q."stage_name" = 'Qualified' AND w."stage_name" = 'Waitlisted'
   AND a."current_stage_id" = q."stage_id";

UPDATE "tbl_application_stage_log" l
   SET "stage_id" = w."stage_id"
  FROM "tbl_admission_stage" q, "tbl_admission_stage" w
 WHERE q."stage_name" = 'Qualified' AND w."stage_name" = 'Waitlisted'
   AND l."stage_id" = q."stage_id";

DELETE FROM "tbl_admission_stage"
 WHERE "stage_name" = 'Qualified'
   AND EXISTS (SELECT 1 FROM "tbl_admission_stage" WHERE "stage_name" = 'Waitlisted');

-- Normal case: rename in place.
UPDATE "tbl_admission_stage" SET "stage_name" = 'Waitlisted' WHERE "stage_name" = 'Qualified';
