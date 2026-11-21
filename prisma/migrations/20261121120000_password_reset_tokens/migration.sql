-- =====================================================================
-- Password reset tokens for the "Forgot password" email link.
-- Additive only.
-- =====================================================================

-- CreateTable
CREATE TABLE "tbl_password_reset_token" (
    "token_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_password_reset_token_pkey" PRIMARY KEY ("token_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_password_reset_token_token_hash_key" ON "tbl_password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "tbl_password_reset_token_user_id_idx" ON "tbl_password_reset_token"("user_id");

-- AddForeignKey
ALTER TABLE "tbl_password_reset_token" ADD CONSTRAINT "tbl_password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user_account"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
