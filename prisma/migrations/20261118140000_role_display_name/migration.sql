-- Editable role label for the User Management page. role_name stays the
-- fixed code used for access checks. Additive only.

-- AlterTable
ALTER TABLE "tbl_role" ADD COLUMN "display_name" VARCHAR(100);
