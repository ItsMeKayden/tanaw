-- =====================================================================
-- The "Course" module becomes "Course Recommendation" (RECOMMENDATION).
-- Data-only migration; no schema change. On a fresh database the
-- permissions do not exist yet and these statements do nothing (the seed
-- creates RECOMMENDATION_* with the defaults below).
-- =====================================================================

-- 1. Rename the permission codes, keeping existing role assignments.
UPDATE "tbl_permission"
SET "permission_code" = 'RECOMMENDATION_' || split_part("permission_code", '_', 2),
    "module_name"     = 'RECOMMENDATION',
    "description"     = split_part("permission_code", '_', 2) || ' access for the RECOMMENDATION module.'
WHERE "permission_code" IN ('COURSE_READ', 'COURSE_WRITE')
  AND NOT EXISTS (
      SELECT 1 FROM "tbl_permission" WHERE "module_name" = 'RECOMMENDATION'
  );

-- 2. Make sure both permissions exist (COURSE_WRITE may never have existed).
INSERT INTO "tbl_permission" ("permission_code", "module_name", "description")
SELECT v.code, 'RECOMMENDATION', v.type || ' access for the RECOMMENDATION module.'
FROM (VALUES ('RECOMMENDATION_READ', 'READ'), ('RECOMMENDATION_WRITE', 'WRITE')) AS v(code, type)
WHERE EXISTS (SELECT 1 FROM "tbl_permission")
ON CONFLICT ("permission_code") DO NOTHING;

-- 3. New default access: Guidance manages recommendations, Admission and
--    the President view them, the Registrar has no access.
DELETE FROM "tbl_role_permission" AS rp
USING "tbl_role" AS r, "tbl_permission" AS p
WHERE rp."role_id" = r."role_id"
  AND rp."permission_id" = p."permission_id"
  AND p."module_name" = 'RECOMMENDATION'
  AND r."role_name" IN ('REGISTRAR', 'ADMISSION', 'PRESIDENT', 'GUIDANCE');

INSERT INTO "tbl_role_permission" ("role_id", "permission_id")
SELECT r."role_id", p."permission_id"
FROM "tbl_role" AS r
JOIN "tbl_permission" AS p ON p."module_name" = 'RECOMMENDATION'
WHERE (r."role_name" IN ('SYSTEM_ADMIN', 'GUIDANCE'))
   OR (r."role_name" IN ('ADMISSION', 'PRESIDENT') AND p."permission_code" = 'RECOMMENDATION_READ')
ON CONFLICT DO NOTHING;
