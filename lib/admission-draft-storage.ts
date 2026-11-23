import {
  getDraftStepName,
  sanitizeDraftValues,
} from "@/features/admission/draft-data";

const DRAFT_PREFIX = "admission_draft_";
const OWNER_KEY = "admission_draft_owner";

export type StoredAdmissionDraft = {
  lastUpdated: number;
  values: Record<string, string>;
};

function draftKey(userId: string, stepId: string) {
  return `${DRAFT_PREFIX}${userId}_${stepId}`;
}

function removeKeysExcept(userId: string) {
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (
      key?.startsWith(DRAFT_PREFIX) &&
      key !== OWNER_KEY &&
      !key.startsWith(`${DRAFT_PREFIX}${userId}_`)
    ) {
      localStorage.removeItem(key);
    }
  }
}

export function setAdmissionDraftOwner(userId: string) {
  try {
    const previous = localStorage.getItem(OWNER_KEY);
    if (previous && previous !== userId) {
      clearAdmissionDrafts();
    } else if (!previous) {
      removeKeysExcept(userId);
    }
    localStorage.setItem(OWNER_KEY, userId);
  } catch (error) {
    console.error("Could not establish the admission draft owner:", error);
    return false;
  }
  return true;
}

export function readAdmissionDraft(userId: string, stepId: string): StoredAdmissionDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, stepId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("lastUpdated" in parsed) ||
      !("values" in parsed) ||
      typeof parsed.lastUpdated !== "number" ||
      !Number.isFinite(parsed.lastUpdated)
    ) {
      localStorage.removeItem(draftKey(userId, stepId));
      return null;
    }
    const values = sanitizeDraftValues(stepId, parsed.values);
    if (!values) {
      localStorage.removeItem(draftKey(userId, stepId));
      return null;
    }
    return { lastUpdated: parsed.lastUpdated, values };
  } catch (error) {
    console.error("Could not read the admission draft:", error);
    return null;
  }
}

export function writeAdmissionDraft(
  userId: string,
  stepId: string,
  values: Record<string, string>,
  lastUpdated = Date.now(),
) {
  if (!getDraftStepName(stepId)) return false;
  const cleanValues = sanitizeDraftValues(stepId, values);
  if (!cleanValues) return false;
  try {
    if (!setAdmissionDraftOwner(userId)) return false;
    localStorage.setItem(
      draftKey(userId, stepId),
      JSON.stringify({ lastUpdated, values: cleanValues }),
    );
    return true;
  } catch (error) {
    console.error("Could not save the admission draft locally:", error);
    return false;
  }
}

export function removeAdmissionDraft(userId: string, stepId: string) {
  try {
    localStorage.removeItem(draftKey(userId, stepId));
  } catch (error) {
    console.error("Could not remove the admission draft:", error);
  }
}

/** Explicit logout/account switch only; timeout preserves drafts for recovery. */
export function clearAdmissionDrafts() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Could not clear admission drafts:", error);
  }
}
