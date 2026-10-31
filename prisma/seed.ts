import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const applicants = [
  { first: "Juan", last: "Dela Cruz", middle: "Santos", sex: "Male", score: 8 },
  { first: "Maria", last: "Santos", middle: "Reyes", sex: "Female", score: 9 },
  { first: "Pedro", last: "Garcia", middle: "Lopez", sex: "Male", score: 6 },
  { first: "Ana", last: "Reyes", middle: "Cruz", sex: "Female", score: 7 },
  { first: "Mark", last: "Mendoza", middle: "Ramos", sex: "Male", score: 9 },
  { first: "Sofia", last: "Torres", middle: "Dizon", sex: "Female", score: 5 },
  {
    first: "Daniel",
    last: "Flores",
    middle: "Bautista",
    sex: "Male",
    score: 10,
  },
  {
    first: "Angela",
    last: "Castillo",
    middle: "Rivera",
    sex: "Female",
    score: 7,
  },
  {
    first: "Miguel",
    last: "Aquino",
    middle: "Villanueva",
    sex: "Male",
    score: 6,
  },
  {
    first: "Isabella",
    last: "Ramos",
    middle: "Fernandez",
    sex: "Female",
    score: 8,
  },
];

const stageNames = [
  "Application Submitted",
  "For Examination",
  "Exam Completed",
  "For Evaluation",
];

async function main() {
  console.log("Starting TANAW sample data seeding...");

  // 1. Create or reuse admission cycle
  let cycle = await prisma.tbl_admission_cycle.findFirst({
    where: { school_year: "2026-2027" },
  });

  if (!cycle) {
    cycle = await prisma.tbl_admission_cycle.create({
      data: {
        school_year: "2026-2027",
        start_date: new Date("2026-08-01"),
        end_date: new Date("2027-06-30"),
        is_active: true,
      },
    });
  }

  console.log("Admission cycle ready.");

  // 2. Create or reuse admission stages
  const stages = [];

  for (let i = 0; i < stageNames.length; i++) {
    let stage = await prisma.tbl_admission_stage.findFirst({
      where: { stage_name: stageNames[i] },
    });

    if (!stage) {
      stage = await prisma.tbl_admission_stage.create({
        data: {
          stage_name: stageNames[i],
          stage_order: i + 1,
        },
      });
    }

    stages.push(stage);
  }

  console.log("Admission stages ready.");

  // 3. Create or reuse exam
  let exam = await prisma.tbl_exam.findFirst({
    where: {
      exam_name: "TANAW Entrance Examination 2026",
      cycle_id: cycle.cycle_id,
    },
  });

  if (!exam) {
    exam = await prisma.tbl_exam.create({
      data: {
        cycle_id: cycle.cycle_id,
        exam_name: "TANAW Entrance Examination 2026",
        exam_date: new Date("2026-11-15"),
        total_items: 10,
        max_score: 10,
      },
    });
  }

  console.log("Entrance examination ready.");

  // 4. Create or reuse exam questions
  const questions = [];

  for (let i = 1; i <= 10; i++) {
    let question = await prisma.tbl_exam_question.findFirst({
      where: {
        exam_id: exam.exam_id,
        question_no: i,
      },
    });

    if (!question) {
      question = await prisma.tbl_exam_question.create({
        data: {
          exam_id: exam.exam_id,
          question_no: i,
          correct_answer: "A",
          points: 1,
        },
      });
    }

    questions.push(question);
  }

  console.log("Exam questions ready.");

  // 5. Create applicants, applications, results, and responses
  for (let i = 0; i < applicants.length; i++) {
    const applicantData = applicants[i];

    const email = `tanaw.applicant${String(i + 1).padStart(2, "0")}@example.test`;

    // Find or create applicant
    let applicant = await prisma.tbl_applicant.findFirst({
      where: { email },
    });

    if (!applicant) {
      applicant = await prisma.tbl_applicant.create({
        data: {
          first_name: applicantData.first,
          last_name: applicantData.last,
          middle_name: applicantData.middle,
          sex: applicantData.sex,
          birth_date: new Date(`200${i % 5}-0${(i % 9) + 1}-15`),
          email,
          mobile_no: `091700000${String(i + 1).padStart(2, "0")}`,
        },
      });
    }

    // Find or create application
    const applicationNo = `TANAW-2026-${String(i + 1).padStart(4, "0")}`;

    let application = await prisma.tbl_application.findUnique({
      where: { application_no: applicationNo },
    });

    if (!application) {
      application = await prisma.tbl_application.create({
        data: {
          applicant_id: applicant.applicant_id,
          cycle_id: cycle.cycle_id,
          current_stage_id: stages[i % stages.length].stage_id,
          application_no: applicationNo,
          application_date: new Date("2026-10-01"),
        },
      });
    }

    // Find or create exam result
    let result = await prisma.tbl_exam_result.findFirst({
      where: {
        application_id: application.application_id,
        exam_id: exam.exam_id,
      },
    });

    const score = applicantData.score;
    const percentage = score * 10;

    if (!result) {
      result = await prisma.tbl_exam_result.create({
        data: {
          application_id: application.application_id,
          exam_id: exam.exam_id,
          raw_score: score,
          percentage,
          result_status: percentage >= 75 ? "PASSED" : "FAILED",
        },
      });
    }

    // Create or update individual question responses
    for (let q = 0; q < questions.length; q++) {
      const isCorrect = q < score;

      await prisma.tbl_question_response.upsert({
        where: {
          result_id_question_id: {
            result_id: result.result_id,
            question_id: questions[q].question_id,
          },
        },
        update: {
          selected_answer: isCorrect ? "A" : "B",
          is_correct: isCorrect,
          points_earned: isCorrect ? 1 : 0,
        },
        create: {
          result_id: result.result_id,
          question_id: questions[q].question_id,
          selected_answer: isCorrect ? "A" : "B",
          is_correct: isCorrect,
          points_earned: isCorrect ? 1 : 0,
        },
      });
    }

    console.log(`Processed applicant ${i + 1}: ${applicationNo}`);
  }

  console.log("--------------------------------");
  console.log("TANAW sample data seeding completed!");
  console.log("Admission cycle: 1");
  console.log("Admission stages: 4");
  console.log("Applicants: 10");
  console.log("Applications: 10");
  console.log("Exam: 1");
  console.log("Exam questions: 10");
  console.log("Exam results: 10");
  console.log("Question responses: 100");
  console.log("--------------------------------");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
