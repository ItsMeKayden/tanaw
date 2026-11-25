import "dotenv/config";

import path from "node:path";

/**
 * Demo data for local development: applicants spread across every admission
 * stage, exam results, stage history, quotas, and sample documents. Exam
 * sessions, attendance, and subject scores come from ./demo-exams.
 *
 * Everything here is deterministic (same data on every machine) and
 * idempotent: demo applications use the "DEMO-" application number prefix and
 * are skipped if they already exist. `--reset-demo` removes them first.
 */
import { ADMISSION_STAGES } from "../../features/admission/stages";
import { generateRecommendations } from "../../features/recommendation/engine";
import { log, prisma, warn } from "./client";
import { resetDemoExamSessions, seedDemoExamSchedule, seedDemoSubjectScores } from "./demo-exams";
import { seedDemoQuestionContent } from "./demo-questions";

// House no. / street for demo applications.
const DEMO_STREETS = ["Mabini St.", "Rizal Ave.", "Kalayaan Ave.", "Maginhawa St.", "Tandang Sora Ave.", "Aurora Blvd.", "Commonwealth Ave.", "Visayas Ave."];

export const DEMO_PREFIX = "DEMO-";
const DEMO_EMAIL_DOMAIN = "@example.test";
const DEMO_COUNT = 36;
const PASSING_PERCENT = 75;
const EXAM_NAME = "TANAW Admission Test";

const FIRST_NAMES: [string, "Male" | "Female"][] = [
  ["Juan", "Male"], ["Maria", "Female"], ["Jose", "Male"], ["Ana", "Female"],
  ["Mark", "Male"], ["Sofia", "Female"], ["Daniel", "Male"], ["Angela", "Female"],
  ["Miguel", "Male"], ["Isabella", "Female"], ["Carlo", "Male"], ["Patricia", "Female"],
  ["Paolo", "Male"], ["Kristine", "Female"], ["Rafael", "Male"], ["Bea", "Female"],
  ["Gabriel", "Male"], ["Nicole", "Female"],
];

const LAST_NAMES = [
  "Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Torres", "Flores",
  "Castillo", "Aquino", "Ramos", "Villanueva", "Bautista", "Fernandez",
  "Gonzales", "Navarro", "Lopez", "Rivera", "Domingo",
];

/** Tiny valid PDF used as a stand-in for uploaded documents. */
function samplePdf(title: string) {
  const text = title.replace(/[()\\]/g, "");
  const stream = `BT /F1 14 Tf 20 70 Td (${text}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length ${stream.length}>>stream`,
    stream,
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Removes demo applications (and their applicants). Real data is untouched. */
export async function resetDemoData() {
  const applications = await prisma.tbl_application.findMany({
    where: { application_no: { startsWith: DEMO_PREFIX } },
    select: { application_id: true, applicant_id: true },
  });

  const applicantIds = applications
    .map((a) => a.applicant_id)
    .filter((id): id is number => id !== null);

  // Demo exam sessions hang off the exam, not an application; remove them first.
  const demoExams = await prisma.tbl_exam.findMany({ where: { exam_name: EXAM_NAME }, select: { exam_id: true } });
  for (const exam of demoExams) await resetDemoExamSessions(exam.exam_id);

  // Stage logs, exam results, subject scores, seats, and documents cascade with the application.
  await prisma.tbl_application.deleteMany({
    where: { application_id: { in: applications.map((a) => a.application_id) } },
  });
  await prisma.tbl_applicant.deleteMany({
    where: { applicant_id: { in: applicantIds }, tbl_application: { none: {} } },
  });

  log("demo", `removed ${applications.length} demo applications`);
}

export async function seedDemoData() {
  if (process.env.NODE_ENV === "production") {
    warn("demo", "demo data is never seeded in production — skipped.");
    return;
  }

  const cycle = await prisma.tbl_admission_cycle.findFirst({
    where: { is_active: true },
    orderBy: { start_date: "desc" },
  });
  if (!cycle) {
    warn("demo", "no active admission cycle — skipped.");
    return;
  }

  const [stages, branches, programs, barangays, schools, actor] = await Promise.all([
    prisma.tbl_admission_stage.findMany(),
    prisma.tbl_branch.findMany({ where: { is_active: true }, orderBy: { branch_id: "asc" } }),
    prisma.tbl_program.findMany({ where: { is_active: true }, orderBy: { program_id: "asc" } }),
    prisma.tbl_barangay.findMany({ orderBy: { barangay_id: "asc" }, select: { barangay_id: true } }),
    prisma.tbl_school.findMany({ orderBy: { school_id: "asc" }, select: { school_id: true } }),
    prisma.tbl_user_account.findFirst({
      where: { username: { in: ["test.admission@example.com", "systemadmin"] } },
      orderBy: { user_id: "asc" },
      select: { user_id: true },
    }),
  ]);

  if (!branches.length || programs.length < 3 || !barangays.length || !schools.length) {
    warn("demo", "reference data missing (campuses, programs, barangays, schools) — run the base seed first.");
    return;
  }

  const stageId = (name: string) => {
    const stage = stages.find((s) => s.stage_name === name);
    if (!stage) throw new Error(`Admission stage "${name}" is missing — run the base seed first.`);
    return stage.stage_id;
  };

  await seedQuotas(cycle.cycle_id, branches.map((b) => b.branch_id), programs.map((p) => p.program_id), actor?.user_id ?? null);

  const exam =
    (await prisma.tbl_exam.findFirst({ where: { cycle_id: cycle.cycle_id, exam_name: EXAM_NAME } })) ??
    (await prisma.tbl_exam.create({
      data: {
        cycle_id: cycle.cycle_id,
        exam_name: EXAM_NAME,
        exam_date: new Date("2026-09-12T00:00:00.000Z"),
        total_items: 100,
        max_score: 100,
      },
    }));

  const year = cycle.school_year.slice(0, 4);
  let created = 0;

  for (let i = 0; i < DEMO_COUNT; i++) {
    const applicationNo = `${DEMO_PREFIX}${year}-${String(i + 1).padStart(4, "0")}`;
    const exists = await prisma.tbl_application.findUnique({
      where: { application_no: applicationNo },
      select: { application_id: true },
    });
    if (exists) continue;

    const [firstName, sex] = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    const middleName = LAST_NAMES[(i * 5 + 3) % LAST_NAMES.length];
    const applicationDate = new Date(Date.UTC(Number(year), 7, 1 + (i % 28)));
    const rawScore = 50 + ((i * 37) % 51); // 50–100

    // Stage plan: 5 submitted, 5 for exam, 3 exam completed, rest decided.
    const path: string[] = [ADMISSION_STAGES.APPLICATION_SUBMITTED];
    if (i >= 5) path.push(ADMISSION_STAGES.FOR_EXAMINATION);
    if (i >= 10) path.push(ADMISSION_STAGES.EXAM_COMPLETED);
    const passed = rawScore >= PASSING_PERCENT;
    if (i >= 13) {
      path.push(passed ? ADMISSION_STAGES.PASSED : ADMISSION_STAGES.FAILED);
      if (passed && i % 4 === 0) path.push(ADMISSION_STAGES.ENROLLED);
      if (passed && i % 4 === 1) path.push(ADMISSION_STAGES.NOT_ENROLLED);
    }
    const hasResult = i >= 10;

    const choice2 = i % 7 === 0 ? null : programs[(i + 2) % programs.length].program_id;
    const choice3 = i % 7 === 0 || i % 5 === 0 ? null : programs[(i + 4) % programs.length].program_id;

    await prisma.$transaction(async (tx) => {
      const applicant = await tx.tbl_applicant.create({
        data: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          sex,
          birth_date: new Date(Date.UTC(2006 + (i % 3), i % 12, 1 + ((i * 3) % 27))),
          email: `demo.applicant${String(i + 1).padStart(2, "0")}${DEMO_EMAIL_DOMAIN}`,
          mobile_no: `0917${String(1_000_000 + i * 7919).slice(-7)}`,
        },
      });

      const application = await tx.tbl_application.create({
        data: {
          applicant_id: applicant.applicant_id,
          application_no: applicationNo,
          application_date: applicationDate,
          cycle_id: cycle.cycle_id,
          barangay_id: barangays[(i * 13) % barangays.length].barangay_id,
          street_address: `${10 + ((i * 37) % 990)} ${DEMO_STREETS[i % DEMO_STREETS.length]}`,
          branch_id: branches[i % branches.length].branch_id,
          program_id: programs[i % programs.length].program_id,
          program_choice_2_id: choice2,
          program_choice_3_id: choice3,
          school_id: schools[(i * 3) % schools.length].school_id,
          current_stage_id: stageId(path[path.length - 1]),
        },
      });

      await tx.tbl_application_stage_log.createMany({
        data: path.map((stage, step) => ({
          application_id: application.application_id,
          stage_id: stageId(stage),
          changed_by: actor?.user_id ?? null,
          changed_at: addDays(applicationDate, step * 10),
          remarks:
            stage === ADMISSION_STAGES.NOT_ENROLLED
              ? "Did not complete enrollment (demo data)."
              : `${stage} (demo data).`,
        })),
      });

      if (hasResult) {
        await tx.tbl_exam_result.create({
          data: {
            application_id: application.application_id,
            exam_id: exam.exam_id,
            raw_score: rawScore,
            percentage: rawScore, // max score is 100
            result_status: passed ? "PASSED" : "FAILED",
          },
        });
      }

      // Every third applicant has uploaded documents.
      if (i % 3 === 0) {
        const name = `${firstName} ${lastName}`;
        await tx.tbl_application_document.createMany({
          data: [
            ["FORM_138", "Form 138 - Report Card"],
            ["PSA_BIRTH_CERTIFICATE", "PSA Birth Certificate"],
          ].map(([documentType, label]) => {
            const bytes = samplePdf(`${label} - ${name} (sample)`);
            return {
              application_id: application.application_id,
              document_type: documentType,
              file_name: `${documentType.toLowerCase()}-sample.pdf`,
              mime_type: "application/pdf",
              file_size: bytes.byteLength,
              file_data: bytes,
              uploaded_by: actor?.user_id ?? null,
              uploaded_at: applicationDate,
            };
          }),
        });
      }
    });

    created++;
  }

  log("demo", `${DEMO_COUNT} demo applicants (${created} new) in ${cycle.school_year}`);

  await seedExamAnswers(exam.exam_id);
  await seedDemoQuestionContent(exam.exam_id);
  await seedDemoExamSchedule(exam.exam_id, actor?.user_id ?? null);
  await seedDemoSubjectScores(exam.exam_id);

  const scored = await generateRecommendations(prisma, { cycleId: cycle.cycle_id });
  log("demo", `course recommendations generated for ${scored} applicants`);
}

const QUESTIONS_PER_COMPETENCY = 20;
const ANSWERS = ["A", "B", "C", "D"];

/**
 * How many questions (of 20) an applicant got right per competency. Adds up
 * exactly to the raw score; the rotating offsets give each applicant a
 * different strength profile, so recommendations vary.
 */
function correctPerCompetency(rawScore: number, index: number, competencyCount: number) {
  const offsets = [14, -8, 4, -12, 2];
  const counts = Array.from({ length: competencyCount }, (_, c) =>
    Math.min(
      QUESTIONS_PER_COMPETENCY,
      Math.max(0, Math.round((rawScore + offsets[(c + index) % offsets.length]) / competencyCount)),
    ),
  );

  let diff = rawScore - counts.reduce((sum, n) => sum + n, 0);
  for (let step = 0; diff !== 0 && step < 1000; step++) {
    const c = step % competencyCount;
    if (diff > 0 && counts[c] < QUESTIONS_PER_COMPETENCY) {
      counts[c]++;
      diff--;
    } else if (diff < 0 && counts[c] > 0) {
      counts[c]--;
      diff++;
    }
  }
  return counts;
}

/**
 * Demo exam questions (20 per competency, 1 point each) and the answers of
 * demo applicants whose results have none yet.
 */
async function seedExamAnswers(examId: number) {
  const competencies = await prisma.tbl_competency.findMany({
    orderBy: { competency_id: "asc" },
    select: { competency_id: true },
  });
  if (competencies.length === 0) {
    warn("demo", "no competencies — exam answers skipped (run the base seed).");
    return;
  }

  const total = competencies.length * QUESTIONS_PER_COMPETENCY;
  if ((await prisma.tbl_exam_question.count({ where: { exam_id: examId } })) === 0) {
    await prisma.tbl_exam_question.createMany({
      data: Array.from({ length: total }, (_, n) => ({
        exam_id: examId,
        competency_id: competencies[Math.floor(n / QUESTIONS_PER_COMPETENCY)].competency_id,
        question_no: n + 1,
        correct_answer: ANSWERS[n % ANSWERS.length],
        points: 1,
      })),
    });
    await prisma.tbl_exam.update({
      where: { exam_id: examId },
      data: { total_items: total, max_score: total },
    });
  }

  const questions = await prisma.tbl_exam_question.findMany({
    where: { exam_id: examId },
    orderBy: { question_no: "asc" },
    select: { question_id: true, competency_id: true, correct_answer: true },
  });

  const results = await prisma.tbl_exam_result.findMany({
    where: {
      exam_id: examId,
      tbl_question_response: { none: {} },
      tbl_application: { application_no: { startsWith: DEMO_PREFIX } },
    },
    select: { result_id: true, raw_score: true, tbl_application: { select: { application_no: true } } },
  });

  for (const result of results) {
    const index = Number(result.tbl_application?.application_no.split("-").pop() ?? 1) - 1;
    const counts = correctPerCompetency(result.raw_score ?? 0, index, competencies.length);

    await prisma.tbl_question_response.createMany({
      data: questions.map((question) => {
        const c = competencies.findIndex((comp) => comp.competency_id === question.competency_id);
        const position = questions
          .filter((q) => q.competency_id === question.competency_id)
          .indexOf(question);
        const correct = position < counts[c];
        const wrong = ANSWERS[(ANSWERS.indexOf(question.correct_answer) + 1) % ANSWERS.length];
        return {
          result_id: result.result_id,
          question_id: question.question_id,
          selected_answer: correct ? question.correct_answer : wrong,
          is_correct: correct,
          points_earned: correct ? 1 : 0,
        };
      }),
    });
  }

  log("demo", `${questions.length} exam questions, answers for ${results.length} results`);
}

/** Overall, per-campus and per-program quotas; existing quotas are kept. */
async function seedQuotas(
  cycleId: number,
  branchIds: number[],
  programIds: number[],
  updatedBy: number | null,
) {
  const targets: { branch_id: number | null; program_id: number | null; scope: string; slots: number }[] = [
    { branch_id: null, program_id: null, scope: "OVERALL", slots: 300 },
    ...branchIds.map((id) => ({ branch_id: id, program_id: null, scope: "BRANCH", slots: 100 })),
    ...programIds.map((id) => ({ branch_id: null, program_id: id, scope: "PROGRAM", slots: 40 })),
  ];

  let created = 0;
  for (const target of targets) {
    const exists = await prisma.tbl_quota.findFirst({
      where: { cycle_id: cycleId, branch_id: target.branch_id, program_id: target.program_id },
      select: { quota_id: true },
    });
    if (exists) continue;

    await prisma.tbl_quota.create({
      data: {
        cycle_id: cycleId,
        branch_id: target.branch_id,
        program_id: target.program_id,
        quota_scope: target.scope,
        quota_slots: target.slots,
        updated_by: updatedBy,
      },
    });
    created++;
  }

  log("demo", `${targets.length} quotas (${created} new)`);
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  const reset = args.has("--reset") || args.has("--reset-demo");
  const resetOnly = args.has("--reset-only");

  async function main() {
    console.log("Seeding demo data...");

    if (reset) {
      console.log("Demo data (reset)");
      await resetDemoData();
    }

    if (!resetOnly) {
      console.log("Demo data");
      await seedDemoData();
    }

    console.log("Demo data done.");
  }

  main()
    .catch((error) => {
      console.error("Demo data seeding failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
