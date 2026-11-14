"use client";

import { useRef, useState } from "react";

import {
  buildMapDrawing,
  ZERO_FILL,
  type HeatBin,
  type MapDistrictData,
  type MapLevel,
  type Segment,
} from "@/features/map/geo";

type Formats = { png: boolean; xlsx: boolean; csv: boolean; pdf: boolean };
type Includes = { legend: boolean; counts: boolean; filters: boolean };

const ATTRIBUTION = "Boundaries: NAMRIA and PSA via OCHA COD-AB (CC BY-IGO)";

function escapeXml(text: string) {
  return text.replace(/[<>&"']/g, (c) => `&#${c.codePointAt(0)};`);
}

/**
 * PNG of the shaded map (drawn from the GeoJSON, without the street
 * basemap) with optional legend, district counts, and filters.
 */
async function downloadPng(options: {
  districts: MapDistrictData[];
  cityOutline: Segment[];
  level: MapLevel;
  bins: HeatBin[];
  includes: Includes;
  filterLines: string[];
}) {
  const { includes } = options;
  const drawing = buildMapDrawing(options.districts, options.cityOutline, options.level, options.bins, 640);
  const hasSide = includes.legend || includes.counts || includes.filters;
  const sideX = drawing.width + 24;
  const side: string[] = [];
  let y = 48;

  const line = (text: string, size = 12, weight = 400) => {
    side.push(`<text x="${sideX}" y="${y}" font-size="${size}" font-weight="${weight}" fill="#0b0b0b">${escapeXml(text)}</text>`);
    y += size + 8;
  };
  const swatch = (color: string, label: string) => {
    side.push(`<rect x="${sideX}" y="${y - 11}" width="14" height="14" rx="2" fill="${color}"/>`);
    side.push(`<text x="${sideX + 22}" y="${y}" font-size="12" fill="#0b0b0b">${escapeXml(label)}</text>`);
    y += 20;
  };

  if (includes.filters) {
    line("Applied filters", 13, 700);
    for (const f of options.filterLines) line(f);
    line(`Level: ${options.level === "district" ? "Districts" : "Barangays"}`);
    y += 8;
  }
  if (includes.legend) {
    line("Legend (applicants)", 13, 700);
    for (const bin of [...options.bins].reverse()) swatch(bin.color, bin.label);
    swatch(ZERO_FILL, "None");
    y += 8;
  }
  if (includes.counts) {
    line("District counts (applicants / passed)", 13, 700);
    for (const d of options.districts) line(`${d.name}: ${d.applicants} / ${d.admitted}`);
  }

  const shapes = drawing.shapes
    .map((s) => `<path d="${s.d}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`)
    .join("");
  const labels = drawing.labels
    .map(
      (l) =>
        `<text x="${l.x}" y="${l.y}" text-anchor="middle" fill="${l.fill}" font-size="13" font-weight="700" stroke="${l.halo}" stroke-width="3" paint-order="stroke">${escapeXml(l.text)}<tspan x="${l.x}" dy="15">${l.sub}</tspan></text>`,
    )
    .join("");

  const totalWidth = drawing.width + (hasSide ? 300 : 0);
  const totalHeight = Math.max(drawing.height + 44, y + 16);
  const title = `Quezon City applicants by ${options.level}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" font-family="Arial, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="12" y="24" font-size="16" font-weight="700" fill="#0b0b0b">${escapeXml(title)}</text>
<g transform="translate(0,32)">${shapes}${labels}</g>
${side.join("\n")}
<text x="12" y="${totalHeight - 6}" font-size="9" fill="#52514e">${ATTRIBUTION}</text>
</svg>`;

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render the map image."));
      image.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = totalWidth * scale;
    canvas.height = totalHeight * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available in this browser.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not create the PNG.");
    triggerDownload(URL.createObjectURL(blob), `qc-applicant-map-${options.level}-${new Date().toISOString().slice(0, 10)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(href: string, fileName?: string) {
  const link = document.createElement("a");
  link.href = href;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function ExportDialog({
  districts,
  cityOutline,
  level,
  bins,
  filterLines,
  filterQueryString,
}: Readonly<{
  districts: MapDistrictData[];
  cityOutline: Segment[];
  level: MapLevel;
  bins: HeatBin[];
  filterLines: string[];
  filterQueryString: string;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formats, setFormats] = useState<Formats>({ png: true, xlsx: false, csv: false, pdf: false });
  const [includes, setIncludes] = useState<Includes>({ legend: true, counts: true, filters: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const noFormat = !formats.png && !formats.xlsx && !formats.csv && !formats.pdf;

  async function runExport() {
    setError("");
    setBusy(true);
    try {
      const query = new URLSearchParams(filterQueryString);
      query.set("level", level);
      if (!includes.legend) query.set("legend", "0");
      if (!includes.counts) query.set("counts", "0");
      if (!includes.filters) query.set("filters", "0");

      // Server-built files (ExcelJS, PapaParse, @react-pdf/renderer).
      for (const format of ["xlsx", "csv", "pdf"] as const) {
        if (!formats[format]) continue;
        query.set("format", format);
        triggerDownload(`/api/map/export?${query.toString()}`);
        await new Promise((resolve) => setTimeout(resolve, 300)); // let the browser start each download
      }

      if (formats.png) {
        await downloadPng({ districts, cityOutline, level, bins, includes, filterLines });
      }

      dialogRef.current?.close();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  const checkbox = (checked: boolean, onChange: () => void, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-[#191e73]" />
      <span>
        {label}
        {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          dialogRef.current?.showModal();
        }}
        className="rounded-md border border-neutral-600 bg-white px-4 py-1.5 text-sm font-semibold hover:bg-neutral-100"
      >
        Export
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="export-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-neutral-400 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/50"
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void runExport();
          }}
          className="space-y-5 p-6"
        >
          <h2 id="export-title" className="text-lg font-semibold">
            Export map and data
          </h2>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Format</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {checkbox(formats.png, () => setFormats((f) => ({ ...f, png: !f.png })), "Image (PNG)", "Shaded map picture")}
              {checkbox(formats.xlsx, () => setFormats((f) => ({ ...f, xlsx: !f.xlsx })), "Excel (.xlsx)", "Counts, one sheet per table")}
              {checkbox(formats.csv, () => setFormats((f) => ({ ...f, csv: !f.csv })), "Data (CSV)", "Plain counts")}
              {checkbox(formats.pdf, () => setFormats((f) => ({ ...f, pdf: !f.pdf })), "PDF report", "Map, legend and tables")}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Include</legend>
            {checkbox(includes.legend, () => setIncludes((i) => ({ ...i, legend: !i.legend })), "Legend")}
            {checkbox(includes.counts, () => setIncludes((i) => ({ ...i, counts: !i.counts })), "District counts")}
            {checkbox(includes.filters, () => setIncludes((i) => ({ ...i, filters: !i.filters })), "Applied filters")}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-neutral-500 px-4 py-1.5 text-sm hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || noFormat}
              className="rounded-md bg-neutral-800 px-5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "Exporting..." : "Export"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
