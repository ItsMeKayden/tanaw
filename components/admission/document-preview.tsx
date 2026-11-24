"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * Thumbnail of an uploaded document (Form 138, PSA birth certificate) that
 * opens a large in-page preview, so staff don't need a new tab to check it.
 * Images show as a picture; PDFs show a PDF tile and open in an embedded viewer.
 */
export function DocumentPreview({
  src,
  fileName,
  mimeType,
  title,
  meta,
  allowDownload = true,
  variant = "thumbnail",
}: Readonly<{
  /** /api/documents/{id}, or an object URL for a file that isn't uploaded yet. */
  src: string;
  fileName: string;
  mimeType: string;
  /** Document kind shown as the preview title, e.g. "PSA birth certificate". */
  title: string;
  /** Small text after the file name, e.g. the file size. */
  meta?: string;
  allowDownload?: boolean;
  /**
   * thumbnail = small square next to the file name (lists, forms).
   * card = large preview showing the actual image or the PDF's first page
   * (pages where staff check the document, e.g. Enrollment Verification).
   */
  variant?: "thumbnail" | "card";
}>) {
  const [open, setOpen] = useState(false);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const trigger =
    variant === "card" ? (
      <div className="group flex min-w-0 flex-col gap-1.5">
        <div className="relative h-64 w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100 transition-shadow group-hover:shadow-md group-hover:ring-2 group-hover:ring-[#191e73]/30">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`${title} preview`} loading="lazy" className="size-full object-contain" />
          )}
          {isPdf && (
            // The browser's PDF viewer, without its toolbar, shows the first page.
            <iframe
              src={`${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={`${title} preview`}
              tabIndex={-1}
              loading="lazy"
              className="pointer-events-none size-full border-0 bg-white"
            />
          )}
          {!isImage && !isPdf && (
            <span className="flex size-full items-center justify-center text-sm text-neutral-600">No preview</span>
          )}
          {/* Covers the preview so a click anywhere opens the large view (iframes swallow clicks). */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Enlarge ${title}: ${fileName}`}
            className="absolute inset-0 flex items-end justify-center bg-transparent pb-2 focus-visible:ring-2 focus-visible:ring-[#191e73]/40 focus-visible:outline-none focus-visible:ring-inset"
          >
            <span className="rounded-full bg-[#191e73]/90 px-3 py-1 text-xs font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              Click to enlarge
            </span>
          </button>
        </div>
        <span className="truncate text-xs text-neutral-600" title={fileName}>
          {fileName}
          {meta ? ` · ${meta}` : ""}
        </span>
      </div>
    ) : null;

  return (
    <>
      {trigger ?? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex max-w-full items-center gap-2.5 rounded-md text-left focus-visible:ring-2 focus-visible:ring-[#191e73]/30 focus-visible:outline-none"
        title={`Preview ${fileName}`}
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-300 bg-neutral-50 transition-shadow group-hover:shadow-md group-hover:ring-2 group-hover:ring-[#191e73]/30">
          {isImage ? (
            // Authenticated, uncached document URL: next/image can't optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`${title} thumbnail`} loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center text-red-700">
              <FileText className="size-6" aria-hidden="true" />
              <span className="text-[10px] font-bold">{isPdf ? "PDF" : "FILE"}</span>
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[#191e73] group-hover:underline">{fileName}</span>
          <span className="block text-xs text-neutral-500">
            {meta ? `${meta} · ` : ""}Click to preview
          </span>
        </span>
      </button>
      )}

      <Modal open={open} onOpenChange={setOpen} title={title} description={fileName}>
        <div className="flex flex-col gap-3">
          <div className="flex min-h-[50vh] items-center justify-center rounded-lg bg-neutral-100">
            {isImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={title} className="max-h-[70vh] w-auto max-w-full object-contain" />
            )}
            {isPdf && <iframe src={src} title={title} className="h-[70vh] w-full rounded-lg border-0 bg-white" />}
            {!isImage && !isPdf && <p className="text-sm text-neutral-600">No preview available for this file type.</p>}
          </div>
          <div className="flex justify-end gap-2 text-sm">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-500 bg-white px-3 hover:bg-neutral-100"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open in new tab
            </a>
            {allowDownload && (
              <a
                href={src}
                download={fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#191e73] px-3 font-semibold text-white hover:bg-[#232a99]"
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
