CREATE TABLE "tbl_admission_draft" (
    "draft_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "step_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_admission_draft_pkey" PRIMARY KEY ("draft_id")
);

CREATE UNIQUE INDEX "tbl_admission_draft_user_id_step_id_key"
ON "tbl_admission_draft"("user_id", "step_id");
CREATE INDEX "tbl_admission_draft_user_id_status_idx"
ON "tbl_admission_draft"("user_id", "status");
CREATE INDEX "tbl_admission_draft_updated_at_idx"
ON "tbl_admission_draft"("updated_at");

ALTER TABLE "tbl_admission_draft"
ADD CONSTRAINT "tbl_admission_draft_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "tbl_user_account"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;
