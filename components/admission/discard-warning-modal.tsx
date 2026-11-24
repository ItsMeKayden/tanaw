"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";

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
    <ConfirmModal
      open={open}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
      title="Discard unsaved changes?"
      heading="You have unsaved details in this applicant form."
      description="If you cancel now, any information or documents you entered will be lost. Are you sure you want to discard your changes?"
      cancelLabel="Keep editing"
      confirmLabel="Discard changes"
      tone="danger"
      zIndex="z-60"
    />
  );
}
