-- Ensure all required roles exist before migrating accounts.
INSERT INTO "tbl_role" ("role_name", "description")
VALUES
    ('SYSTEM_ADMIN', 'Full system access'),
    ('PRESIDENT', 'Read-only access to all modules'),
    ('ADMISSION', 'Admission module access'),
    ('REGISTRAR', 'Registrar module access'),
    ('GUIDANCE', 'Guidance module access')
ON CONFLICT ("role_name") DO NOTHING;


-- Migrate only the five official accounts.
-- The legacy email is temporarily used as the username.
INSERT INTO "tbl_user_account" (
    "role_id",
    "username",
    "password_hash",
    "full_name",
    "email",
    "is_active",
    "created_at"
)
SELECT
    r."role_id",
    u."email",
    u."password",
    u."name",
    u."email",
    u."isActive",
    u."createdAt"
FROM "User" AS u
INNER JOIN "tbl_role" AS r
    ON r."role_name" = u."role"::text
WHERE u."email" IN (
    'systemadmin@tanaw.com',
    'test.president@example.com',
    'test.admission@example.com',
    'test.registrar@example.com',
    'test.guidance@example.com'
)
ON CONFLICT ("username") DO NOTHING;