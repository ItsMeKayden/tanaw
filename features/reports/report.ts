/**
 * One report definition → CSV (PapaParse), Excel (ExcelJS), or PDF
 * (@react-pdf/renderer, see pdf.tsx). Server-side only.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";

import type { HeatBin, MapDrawing } from "@/features/map/geo";

export type ReportValue = string | number | null | undefined;

export type ReportColumn = {
  key: string;
  label: string;
  /** Relative width (PDF) / characters (Excel). */
  width?: number;
  align?: "left" | "right";
};

export type ReportTable = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportValue>[];
};

export type Report = {
  title: string;
  /** e.g. applied filters; printed under the title. */
  meta?: string[];
  tables: ReportTable[];
  /** Optional shaded map (PDF only). */
  map?: { drawing: MapDrawing; legend?: HeatBin[]; zeroFill?: string };
  notes?: string[];
  /** File name without extension. */
  fileBase: string;
};

export type ExportFormat = "csv" | "xlsx" | "pdf";

export function parseExportFormat(value: string | null | undefined, fallback: ExportFormat = "csv"): ExportFormat {
  return value === "xlsx" || value === "pdf" || value === "csv" ? value : fallback;
}

const cellText = (value: ReportValue) => (value === null || value === undefined ? "" : value);

/** CSV via PapaParse; formula-looking cells are escaped for spreadsheets. */
export function reportToCsv(report: Report) {
  const blocks: string[] = [];
  const header = [[report.title], ...(report.meta ?? []).map((line) => [line])];
  blocks.push(Papa.unparse(header, { escapeFormulae: true }));

  for (const table of report.tables) {
    const data = table.rows.map((row) => table.columns.map((c) => cellText(row[c.key])));
    blocks.push(
      Papa.unparse([[table.title]], { escapeFormulae: true }) +
        "\r\n" +
        Papa.unparse({ fields: table.columns.map((c) => c.label), data }, { escapeFormulae: true }),
    );
  }

  if (report.notes?.length) {
    blocks.push(Papa.unparse(report.notes.map((note) => [note]), { escapeFormulae: true }));
  }

  // Byte-order mark so Excel opens the file as UTF-8 (ñ, –).
  return `${String.fromCodePoint(0xfeff)}${blocks.join("\r\n\r\n")}\r\n`;
}

function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base} ${i}`;
  used.add(name);
  return name;
}

/** Excel workbook via ExcelJS: one sheet per table, with title and filters on top. */
export async function reportToXlsx(report: Report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TANAW";
  workbook.created = new Date();
  const used = new Set<string>();

  for (const table of report.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used));

    sheet.addRow([report.title]).font = { bold: true, size: 14 };
    sheet.addRow([table.title]).font = { bold: true, size: 12 };
    for (const line of report.meta ?? []) sheet.addRow([line]).font = { color: { argb: "FF52514E" } };
    sheet.addRow([]);

    const headerRow = sheet.addRow(table.columns.map((c) => c.label));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3E4F8" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FF737373" } } };
    });

    for (const row of table.rows) {
      sheet.addRow(table.columns.map((c) => cellText(row[c.key])));
    }

    table.columns.forEach((column, index) => {
      const longest = Math.max(
        column.label.length,
        ...table.rows.map((row) => String(cellText(row[column.key])).length),
      );
      sheet.getColumn(index + 1).width = column.width ?? Math.min(50, Math.max(10, longest + 2));
      if (column.align === "right") sheet.getColumn(index + 1).alignment = { horizontal: "right" };
    });

    const headerIndex = headerRow.number;
    sheet.views = [{ state: "frozen", ySplit: headerIndex }];
    if (table.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: headerIndex, column: 1 },
        to: { row: headerIndex + table.rows.length, column: table.columns.length },
      };
    }

    for (const note of report.notes ?? []) {
      sheet.addRow([]);
      sheet.addRow([note]).font = { italic: true, size: 9, color: { argb: "FF52514E" } };
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const MIME: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Builds the file in the requested format and wraps it in a download response. */
export async function reportResponse(report: Report, format: ExportFormat) {
  let body: BodyInit;
  if (format === "csv") body = reportToCsv(report);
  else if (format === "xlsx") body = new Uint8Array(await reportToXlsx(report));
  else {
    const { reportToPdf } = await import("@/features/reports/pdf");
    body = new Uint8Array(await reportToPdf(report));
  }

  const fileName = `${report.fileBase.replace(/[^\w.-]+/g, "-")}.${format}`;
  return new Response(body, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
