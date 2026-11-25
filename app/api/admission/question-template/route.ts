import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import Papa from "papaparse";

import { auth } from "@/auth";
import { resolveCycle } from "@/features/admission/admission-stats";
import { getCycleExam } from "@/features/admission/exam";
import { BASE_SET } from "@/features/admission/exam-scoring";
import { hasAnyPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const HEADERS = [
  "question_no",
  "question_text",
  "choice_a",
  "choice_b",
  "choice_c",
  "choice_d",
  "correct_answer",
  "points",
  "subject",
] as const;

type Row = Record<(typeof HEADERS)[number], string | number>;

const SAMPLE: Row[] = [
  { question_no: 1, question_text: "What is 15% of 240?", choice_a: "36", choice_b: "24", choice_c: "32", choice_d: "40", correct_answer: "A", points: 1, subject: "Mathematics" },
  { question_no: 2, question_text: "What is the synonym of “diligent”?", choice_a: "lazy", choice_b: "hardworking", choice_c: "careless", choice_d: "noisy", correct_answer: "B", points: 1, subject: "English" },
  { question_no: 3, question_text: "Which gas do plants absorb during photosynthesis?", choice_a: "oxygen", choice_b: "nitrogen", choice_c: "carbon dioxide", choice_d: "hydrogen", correct_answer: "C", points: 1, subject: "Science" },
];

/**
 * Question import template (Excel or CSV). ?prefill=1 fills it with the
 * school year's Set A questions so they can be edited and re-imported with
 * "Update existing questions".
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role) return new Response("Unauthorized", { status: 401 });
  if (!(await hasAnyPermission(session.user.role, ["admission"], "read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  const prefill = params.get("prefill") === "1";

  const competencies = await prisma.tbl_competency.findMany({
    orderBy: { competency_id: "asc" },
    select: { competency_name: true },
  });

  let rows: Row[] = SAMPLE;
  let schoolYear = "";
  if (prefill) {
    const { cycle } = await resolveCycle(params.get("cycle") ?? undefined);
    const exam = cycle ? await getCycleExam(cycle.cycle_id) : null;
    schoolYear = cycle?.school_year ?? "";
    const questions = exam
      ? await prisma.tbl_exam_question.findMany({
          where: { exam_id: exam.exam_id, set_label: BASE_SET },
          orderBy: { question_no: "asc" },
          include: { tbl_competency: { select: { competency_name: true } } },
        })
      : [];
    rows = questions.map((q) => ({
      question_no: q.question_no,
      question_text: q.question_text ?? "",
      choice_a: q.choice_a ?? "",
      choice_b: q.choice_b ?? "",
      choice_c: q.choice_c ?? "",
      choice_d: q.choice_d ?? "",
      correct_answer: q.correct_answer,
      points: q.points,
      subject: q.tbl_competency?.competency_name ?? "",
    }));
  }

  const base = prefill ? `exam-questions-${schoolYear.replace(/\s+/g, "") || "export"}` : "exam-questions-template";

  if (format === "csv") {
    const csv = Papa.unparse({ fields: [...HEADERS], data: rows.map((r) => HEADERS.map((h) => r[h])) });
    // BOM so Excel opens accented / Filipino text correctly.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "question_no", key: "question_no", width: 12 },
    { header: "question_text", key: "question_text", width: 60 },
    { header: "choice_a", key: "choice_a", width: 22 },
    { header: "choice_b", key: "choice_b", width: 22 },
    { header: "choice_c", key: "choice_c", width: 22 },
    { header: "choice_d", key: "choice_d", width: 22 },
    { header: "correct_answer", key: "correct_answer", width: 15 },
    { header: "points", key: "points", width: 9 },
    { header: "subject", key: "subject", width: 20 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF191E73" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  rows.forEach((row) => sheet.addRow(row));
  sheet.getColumn("question_text").alignment = { wrapText: true, vertical: "top" };

  // Dropdowns and checks for the next 500 rows.
  const subjects = `"${competencies.map((c) => c.competency_name).join(",")}"`;
  for (let r = 2; r <= 501; r++) {
    sheet.getCell(`G${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"A,B,C,D"'],
      showErrorMessage: true,
      errorTitle: "Correct answer",
      error: "Choose A, B, C or D.",
    };
    sheet.getCell(`H${r}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [1, 1000],
      showErrorMessage: true,
      error: "Points must be a whole number from 1 to 1,000.",
    };
    if (competencies.length > 0) {
      sheet.getCell(`I${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [subjects] };
    }
  }

  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ width: 18 }, { width: 90 }];
  help.addRows([
    ["Column", "What to enter"],
    ["question_no", "The item number (1, 2, 3 …). Leave blank to add after the existing questions."],
    ["question_text", "The question as applicants will read it in the test booklet."],
    ["choice_a … choice_d", "The four choices. Fill in all four, or leave all four blank for an answer-key-only item."],
    ["correct_answer", "A, B, C or D (the letter of the right choice)."],
    ["points", "Points for a correct answer. Blank = 1."],
    ["subject", `One of: ${competencies.map((c) => c.competency_name).join(", ")}.`],
    [],
    ["Tip", "Use “Update existing questions” when importing to change questions that already have the same number."],
  ]);
  help.getRow(1).font = { bold: true };
  help.getColumn(2).alignment = { wrapText: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
