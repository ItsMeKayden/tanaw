-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'PRESIDENT';
ALTER TYPE "UserRole" ADD VALUE 'ADMISSION';
ALTER TYPE "UserRole" ADD VALUE 'REGISTRAR';
ALTER TYPE "UserRole" ADD VALUE 'GUIDANCE';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'ADMISSION';
