-- CreateTable
CREATE TABLE "tbl_admission_cycle" (
    "cycle_id" SERIAL NOT NULL,
    "school_year" VARCHAR(50) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_admission_cycle_pkey" PRIMARY KEY ("cycle_id")
);

-- CreateTable
CREATE TABLE "tbl_admission_stage" (
    "stage_id" SERIAL NOT NULL,
    "stage_name" VARCHAR(100) NOT NULL,
    "stage_order" INTEGER NOT NULL,

    CONSTRAINT "tbl_admission_stage_pkey" PRIMARY KEY ("stage_id")
);

-- CreateTable
CREATE TABLE "tbl_applicant" (
    "applicant_id" SERIAL NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "sex" VARCHAR(20),
    "birth_date" DATE,
    "email" VARCHAR(150),
    "mobile_no" VARCHAR(50),

    CONSTRAINT "tbl_applicant_pkey" PRIMARY KEY ("applicant_id")
);

-- CreateTable
CREATE TABLE "tbl_application" (
    "application_id" SERIAL NOT NULL,
    "applicant_id" INTEGER,
    "school_id" INTEGER,
    "barangay_id" INTEGER,
    "branch_id" INTEGER,
    "program_id" INTEGER,
    "cycle_id" INTEGER,
    "current_stage_id" INTEGER,
    "application_no" VARCHAR(50) NOT NULL,
    "application_date" DATE NOT NULL,

    CONSTRAINT "tbl_application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "tbl_application_stage_log" (
    "log_id" SERIAL NOT NULL,
    "application_id" INTEGER,
    "changed_by" INTEGER,
    "stage_id" INTEGER,
    "changed_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "tbl_application_stage_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "tbl_barangay" (
    "barangay_id" SERIAL NOT NULL,
    "district_id" INTEGER,
    "barangay_name" VARCHAR(100) NOT NULL,
    "boundary_geojson" TEXT,

    CONSTRAINT "tbl_barangay_pkey" PRIMARY KEY ("barangay_id")
);

-- CreateTable
CREATE TABLE "tbl_branch" (
    "branch_id" SERIAL NOT NULL,
    "branch_code" VARCHAR(50) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_branch_pkey" PRIMARY KEY ("branch_id")
);

-- CreateTable
CREATE TABLE "tbl_competency" (
    "competency_id" SERIAL NOT NULL,
    "competency_name" VARCHAR(150) NOT NULL,
    "subject_area" VARCHAR(100),
    "description" TEXT,

    CONSTRAINT "tbl_competency_pkey" PRIMARY KEY ("competency_id")
);

-- CreateTable
CREATE TABLE "tbl_course_recommendation" (
    "application_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,
    "compatibility_score" DECIMAL(5,2),
    "rank_no" INTEGER,
    "generated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_course_recommendation_pkey" PRIMARY KEY ("application_id","program_id")
);

-- CreateTable
CREATE TABLE "tbl_district" (
    "district_id" SERIAL NOT NULL,
    "district_name" VARCHAR(100) NOT NULL,
    "boundary_geojson" TEXT,

    CONSTRAINT "tbl_district_pkey" PRIMARY KEY ("district_id")
);

-- CreateTable
CREATE TABLE "tbl_exam" (
    "exam_id" SERIAL NOT NULL,
    "cycle_id" INTEGER,
    "exam_name" VARCHAR(150) NOT NULL,
    "exam_date" DATE,
    "total_items" INTEGER,
    "max_score" INTEGER,

    CONSTRAINT "tbl_exam_pkey" PRIMARY KEY ("exam_id")
);

-- CreateTable
CREATE TABLE "tbl_exam_question" (
    "question_id" SERIAL NOT NULL,
    "exam_id" INTEGER,
    "competency_id" INTEGER,
    "question_no" INTEGER NOT NULL,
    "correct_answer" VARCHAR(255) NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "tbl_exam_question_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "tbl_exam_result" (
    "result_id" SERIAL NOT NULL,
    "application_id" INTEGER,
    "exam_id" INTEGER,
    "import_id" INTEGER,
    "raw_score" INTEGER,
    "percentage" DECIMAL(5,2),
    "result_status" VARCHAR(50),

    CONSTRAINT "tbl_exam_result_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "tbl_import_batch" (
    "import_id" SERIAL NOT NULL,
    "imported_by" INTEGER,
    "file_name" VARCHAR(255) NOT NULL,
    "imported_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "total_records" INTEGER,
    "status" VARCHAR(50),

    CONSTRAINT "tbl_import_batch_pkey" PRIMARY KEY ("import_id")
);

-- CreateTable
CREATE TABLE "tbl_passing_score_setting" (
    "setting_id" SERIAL NOT NULL,
    "cycle_id" INTEGER,
    "updated_by" INTEGER,
    "criteria_type" VARCHAR(100),
    "passing_value" DECIMAL(10,2),
    "target_pass_rate" DECIMAL(5,4),
    "effective_date" DATE,

    CONSTRAINT "tbl_passing_score_setting_pkey" PRIMARY KEY ("setting_id")
);

-- CreateTable
CREATE TABLE "tbl_permission" (
    "permission_id" SERIAL NOT NULL,
    "permission_code" VARCHAR(100) NOT NULL,
    "module_name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "tbl_permission_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "tbl_program" (
    "program_id" SERIAL NOT NULL,
    "program_code" VARCHAR(50) NOT NULL,
    "program_name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_program_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "tbl_program_competency" (
    "program_id" INTEGER NOT NULL,
    "competency_id" INTEGER NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "tbl_program_competency_pkey" PRIMARY KEY ("program_id","competency_id")
);

-- CreateTable
CREATE TABLE "tbl_question_response" (
    "result_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "selected_answer" VARCHAR(255),
    "is_correct" BOOLEAN,
    "points_earned" INTEGER,

    CONSTRAINT "tbl_question_response_pkey" PRIMARY KEY ("result_id","question_id")
);

-- CreateTable
CREATE TABLE "tbl_quota" (
    "quota_id" SERIAL NOT NULL,
    "branch_id" INTEGER,
    "program_id" INTEGER,
    "cycle_id" INTEGER,
    "updated_by" INTEGER,
    "quota_scope" VARCHAR(50),
    "quota_slots" INTEGER NOT NULL,

    CONSTRAINT "tbl_quota_pkey" PRIMARY KEY ("quota_id")
);

-- CreateTable
CREATE TABLE "tbl_role" (
    "role_id" SERIAL NOT NULL,
    "role_name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "tbl_role_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "tbl_role_permission" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "tbl_school" (
    "school_id" SERIAL NOT NULL,
    "school_name" VARCHAR(150) NOT NULL,
    "school_type" VARCHAR(50),
    "city_municipality" VARCHAR(100),

    CONSTRAINT "tbl_school_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "tbl_user_account" (
    "user_id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_user_account_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_application_application_no_key" ON "tbl_application"("application_no");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_user_account_username_key" ON "tbl_user_account"("username");

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "tbl_applicant"("applicant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "tbl_barangay"("barangay_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tbl_branch"("branch_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "tbl_admission_stage"("stage_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "tbl_admission_cycle"("cycle_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "tbl_school"("school_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_stage_log" ADD CONSTRAINT "tbl_application_stage_log_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_stage_log" ADD CONSTRAINT "tbl_application_stage_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "tbl_user_account"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_stage_log" ADD CONSTRAINT "tbl_application_stage_log_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "tbl_admission_stage"("stage_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_barangay" ADD CONSTRAINT "tbl_barangay_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "tbl_district"("district_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_course_recommendation" ADD CONSTRAINT "tbl_course_recommendation_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_course_recommendation" ADD CONSTRAINT "tbl_course_recommendation_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam" ADD CONSTRAINT "tbl_exam_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "tbl_admission_cycle"("cycle_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_question" ADD CONSTRAINT "tbl_exam_question_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "tbl_competency"("competency_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_question" ADD CONSTRAINT "tbl_exam_question_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "tbl_exam"("exam_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_result" ADD CONSTRAINT "tbl_exam_result_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_result" ADD CONSTRAINT "tbl_exam_result_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "tbl_exam"("exam_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_exam_result" ADD CONSTRAINT "tbl_exam_result_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "tbl_import_batch"("import_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_import_batch" ADD CONSTRAINT "tbl_import_batch_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "tbl_user_account"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_passing_score_setting" ADD CONSTRAINT "tbl_passing_score_setting_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "tbl_admission_cycle"("cycle_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_passing_score_setting" ADD CONSTRAINT "tbl_passing_score_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "tbl_user_account"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_program_competency" ADD CONSTRAINT "tbl_program_competency_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "tbl_competency"("competency_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_program_competency" ADD CONSTRAINT "tbl_program_competency_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_question_response" ADD CONSTRAINT "tbl_question_response_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "tbl_exam_question"("question_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_question_response" ADD CONSTRAINT "tbl_question_response_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "tbl_exam_result"("result_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_quota" ADD CONSTRAINT "tbl_quota_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "tbl_branch"("branch_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_quota" ADD CONSTRAINT "tbl_quota_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "tbl_admission_cycle"("cycle_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_quota" ADD CONSTRAINT "tbl_quota_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_quota" ADD CONSTRAINT "tbl_quota_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "tbl_user_account"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_role_permission" ADD CONSTRAINT "tbl_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_role_permission" ADD CONSTRAINT "tbl_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("role_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user_account" ADD CONSTRAINT "tbl_user_account_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
