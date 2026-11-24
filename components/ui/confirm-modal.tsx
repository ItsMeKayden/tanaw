"use client";

import { TriangleAlert } from "lucide-react";

import { Modal } from "@/components/ui/modal";

const TONE_STYLES = {
  danger: {
    iconWrap: "bg-amber-100 text-amber-600",
    button: "bg-red-600 text-white hover:bg-red-700",
  },
  warning: {
    iconWrap: "bg-amber-100 text-amber-600",
    button: "bg-amber-600 text-white hover:bg-amber-700",
  },
  primary: {
    iconWrap: "bg-amber-100 text-amber-600",
    button: "bg-[#191e73] text-white hover:bg-[#232a99]",
  },
} as const;

/**
 * Reusable confirmation/warning modal dialog.
 */
export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  heading,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  tone = "danger",
  zIndex = "z-60",
  isPending = false,
}: Readonly<{
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  heading?: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  tone?: keyof typeof TONE_STYLES;
  zIndex?: string;
  isPending?: boolean;
}>) {
  const styles = TONE_STYLES[tone];

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => !isOpen && !isPending && onCancel()}
      title={title}
      size="sm"
      zIndex={zIndex}
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.iconWrap}`}
          >
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            {heading && (
              <p className="font-medium text-neutral-900">{heading}</p>
            )}
            <p className="text-neutral-600">{description}</p>
          </div>
        </div>

        <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-9 cursor-pointer rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`h-9 cursor-pointer rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
