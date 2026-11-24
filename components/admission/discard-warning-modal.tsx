"use client";

import { TriangleAlert } from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * Confirmation modal shown when the user tries to cancel or close the
 * applicant form after entering or modifying details.
 */
export function DiscardWarningModal({
  open,
  onKeepEditing,
  onDiscard,
}: Readonly<{
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}>) {
  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => !isOpen && onKeepEditing()}
      title="Discard unsaved changes?"
      size="sm"
      zIndex="z-60"
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-neutral-900">
              You have unsaved details in this applicant form.
            </p>
            <p className="text-neutral-600">
              If you cancel now, any information or documents you entered will be
              lost. Are you sure you want to discard your changes?
            </p>
          </div>
        </div>

        <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onKeepEditing}
            className="h-9 cursor-pointer rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="h-9 cursor-pointer rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
          >
            Discard changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
