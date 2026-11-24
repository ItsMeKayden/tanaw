-- Server-side records support absolute and idle session expiration and logout invalidation.
CREATE TABLE "tbl_auth_session" (
    "session_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tbl_auth_session_pkey" PRIMARY KEY ("session_id")
);

CREATE INDEX "tbl_auth_session_user_id_idx" ON "tbl_auth_session"("user_id");
CREATE INDEX "tbl_auth_session_expires_at_idx" ON "tbl_auth_session"("expires_at");

ALTER TABLE "tbl_auth_session"
ADD CONSTRAINT "tbl_auth_session_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "tbl_user_account"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;
