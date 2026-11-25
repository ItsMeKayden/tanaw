// Item analysis for the Analytics module (server-side; imports Prisma).
//
//   Difficulty (p)      share of examinees who answered the item correctly
//   Distribution        how many chose A, B, C, D or left it blank
//
// Data comes from per-question answers (tbl_question_response), which are
// saved when scanned answer sheets are imported.
import { prisma } from "@/lib/prisma";
import { ACTIVE_APPLICATION } from "@/features/admission/archive-core";
import { getCycleExam } from "@/features/admission/exam";
import type { ExamSet } from "@/features/admission/exam-scoring";

export const CHOICES = ["A", "B", "C", "D"] as const;

export type ItemStat = {
  question_id: number;
  question_no: number;
  question_text: string | null;
  subject: string;
  correct_answer: string;
  answered: number;
  correct: number;
  /** % correct (0–100), or null when nobody answered it. */
  difficulty: number | null;
  distribution: Record<(typeof CHOICES)[number] | "blank", number>;
};

export function difficultyLabel(p: number | null) {
  if (p === null) return "No data";
  if (p >= 80) return "Easy";
  if (p >= 40) return "Moderate";
  return "Hard";
}

export async function getItemAnalysis(options: { cycleId: number; set: ExamSet; competencyId: number | null }) {
  const exam = await getCycleExam(options.cycleId);
  if (!exam) return { exam: null, items: [] as ItemStat[], examinees: 0 };

  const questions = await prisma.tbl_exam_question.findMany({
    where: {
      exam_id: exam.exam_id,
      set_label: options.set,
      ...(options.competencyId ? { competency_id: options.competencyId } : {}),
    },
    orderBy: { question_no: "asc" },
    select: {
      question_id: true,
      question_no: true,
      question_text: true,
      correct_answer: true,
      tbl_competency: { select: { competency_name: true } },
    },
  });
  const ids = questions.map((q) => q.question_id);

  const [responses, results] = await Promise.all([
    prisma.tbl_question_response.findMany({
      where: { question_id: { in: ids }, tbl_exam_result: { tbl_application: ACTIVE_APPLICATION } },
      select: { question_id: true, selected_answer: true, is_correct: true },
    }),
    // Examinees of this set (one exam result each), for the Examinees count.
    prisma.tbl_question_response.groupBy({
      by: ["result_id"],
      where: {
        tbl_exam_question: { exam_id: exam.exam_id, set_label: options.set },
        tbl_exam_result: { tbl_application: ACTIVE_APPLICATION },
      },
    }),
  ]);

  const byQuestion = new Map<number, typeof responses>();
  for (const r of responses) byQuestion.set(r.question_id, [...(byQuestion.get(r.question_id) ?? []), r]);

  const items: ItemStat[] = questions.map((q) => {
    const rows = byQuestion.get(q.question_id) ?? [];
    const distribution = { A: 0, B: 0, C: 0, D: 0, blank: 0 };
    for (const r of rows) {
      const choice = (r.selected_answer ?? "").trim().toUpperCase();
      if (choice === "A" || choice === "B" || choice === "C" || choice === "D") distribution[choice]++;
      else distribution.blank++;
    }
    const correct = rows.filter((r) => r.is_correct).length;
    const difficulty = rows.length ? Math.round((correct / rows.length) * 100) : null;
    const answer = q.correct_answer.trim().toUpperCase();

    return {
      question_id: q.question_id,
      question_no: q.question_no,
      question_text: q.question_text,
      subject: q.tbl_competency?.competency_name ?? "No subject",
      correct_answer: answer,
      answered: rows.length,
      correct,
      difficulty,
      distribution,
    };
  });

  return { exam, items, examinees: results.length };
}
