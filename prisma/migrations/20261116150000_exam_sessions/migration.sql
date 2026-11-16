-- =====================================================================
-- Exam Schedule page
--   1. tbl_exam_session: exam sittings (date, venue, room, capacity)
--   2. tbl_exam_session_applicant: seat + attendance per application
-- Additive only; safe on a database that already holds data.
-- =====================================================================

-- CreateTable
CREATE TABLE "tbl_exam_session" (
    "session_id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "session_date" DATE NOT NULL,
    "start_time" VARCHAR(5),
    "venue" VARCHAR(150) NOT NULL,
    "room" VARCHAR(50),
    "capacity" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_exam_session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "tbl_exam_session_applicant" (
    "session_id" INTEGER NOT NULL,
    "application_id" INTEGER NOT NULL,
    "attendance" VARCHAR(20),
    "marked_by" INTEGER,
    "marked_at" TIMESTAMP(6),

    CONSTRAINT "tbl_exam_session_applicant_pkey" PRIMARY KEY ("session_id","application_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_exam_session_applicant_application_id_key" ON "tbl_exam_session_applicant"("application_id");

-- AddForeignKey
ALTER TABLE "tbl_exam_session" ADD CONSTRAINT "tbl_exam_session_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "tbl_exam"("exam_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_session" ADD CONSTRAINT "tbl_exam_session_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_exam_session_applicant" ADD CONSTRAINT "tbl_exam_session_applicant_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tbl_exam_session"("session_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_session_applicant" ADD CONSTRAINT "tbl_exam_session_applicant_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_session_applicant" ADD CONSTRAINT "tbl_exam_session_applicant_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "tbl_user_account"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

