/*
  Warnings:

  - A unique constraint covering the columns `[permission_code]` on the table `tbl_permission` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[role_name]` on the table `tbl_role` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tbl_permission_permission_code_key" ON "tbl_permission"("permission_code");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_role_role_name_key" ON "tbl_role"("role_name");
