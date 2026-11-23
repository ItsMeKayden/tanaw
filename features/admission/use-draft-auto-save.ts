"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { toast } from "@/components/ui/toaster";
import {
  getDraftStepIds,
  getDraftValuesForStep,
  sanitizeDraftValues,
  type DraftStepName,
} from "@/features/admission/draft-data";
import type { ApplicantFormField, ApplicantFormValues } from "@/features/admission/applicant-form";
import { apiPost } from "@/lib/api-client";
import {
  readAdmissionDraft,
  removeAdmissionDraft,
  setAdmissionDraftOwner,
  writeAdmissionDraft,
} from "@/lib/admission-draft-storage";

type ServerDraft = {
  values: Record<string, string>;
  lastUpdated: number;
};

type Props = {
  userId: string;
  mode: "create" | "edit";
  applicantId?: number;
  values: ApplicantFormValues;
  districtId: string;
  setValue: (field: ApplicantFormField, value: string) => void;
  setDistrictId: (value: string) => void;
};

const STEPS: DraftStepName[] = ["personal", "course", "school"];

export function useDraftAutoSave({
  userId,
  mode,
  applicantId,
  values,
  districtId,
  setValue,
  setDistrictId,
}: Props) {
  const stepIds = useMemo(
    () => getDraftStepIds(mode, applicantId),
    [mode, applicantId],
  );
  const latestValues = useRef(values);
  const latestDistrict = useRef(districtId);
  const edited = useRef(false);
  const initialized = useRef(false);
  const skipFirstSave = useRef(true);

  useLayoutEffect(() => {
    latestValues.current = values;
    latestDistrict.current = districtId;
  }, [values, districtId]);

  function applyDraft(stepName: DraftStepName, draftValues: Record<string, string>) {
    const stepId = stepIds[STEPS.indexOf(stepName)];
    const clean = sanitizeDraftValues(stepId, draftValues);
    if (!clean) return;

    for (const [field, value] of Object.entries(clean)) {
      if (field === "districtId") {
        setDistrictId(value);
      } else {
        setValue(field as ApplicantFormField, value);
      }
    }
  }

  function saveLocally() {
    const currentValues = latestValues.current;
    for (let index = 0; index < STEPS.length; index++) {
      const step = STEPS[index];
      const stepId = stepIds[index];
      const stepValues = getDraftValuesForStep(
        { ...currentValues, districtId: latestDistrict.current },
        step,
      );
      writeAdmissionDraft(userId, stepId, stepValues);
    }
  }

  useEffect(() => {
    setAdmissionDraftOwner(userId);
    const localDrafts = new Map<DraftStepName, ReturnType<typeof readAdmissionDraft>>();
    for (let index = 0; index < STEPS.length; index++) {
      const local = readAdmissionDraft(userId, stepIds[index]);
      localDrafts.set(STEPS[index], local);
      if (local) applyDraft(STEPS[index], local.values);
    }
    initialized.current = true;

    let active = true;
    async function reconcile() {
      let restored = false;
      for (let index = 0; index < STEPS.length; index++) {
        const step = STEPS[index];
        const stepId = stepIds[index];
        const local = localDrafts.get(step);
        const response = await apiPost(
          "/api/admission/drafts",
          {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "load", stepId }),
          },
          { userId },
        );
        if (!response.ok) {
          throw new Error(`Draft reconciliation failed (${response.status}).`);
        }
        const result = (await response.json()) as { draft: ServerDraft | null };
        if (!active) return;
        const server = result.draft;

        if (local && (!server || local.lastUpdated > server.lastUpdated)) {
          const syncResponse = await apiPost(
            "/api/admission/drafts",
            {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation: "sync",
                stepId,
                values: local.values,
                lastUpdated: local.lastUpdated,
              }),
            },
            { userId },
          );
          if (!syncResponse.ok) {
            throw new Error(`Draft sync failed (${syncResponse.status}).`);
          }
          restored = true;
        } else if (server) {
          const clean = sanitizeDraftValues(stepId, server.values);
          if (clean && !edited.current) {
            applyDraft(step, clean);
            writeAdmissionDraft(userId, stepId, clean, server.lastUpdated);
          }
        }
      }
      if (active && restored) toast.info("Welcome back—your unsaved progress was restored.");
    }

    void reconcile().catch((error: unknown) => {
      if (active) {
        console.error("Could not reconcile the admission draft:", error);
        toast.error("Your local progress is safe, but could not be synced yet.");
      }
    });

    return () => {
      active = false;
    };
    // Initialize once for this user and form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, applicantId]);

  useEffect(() => {
    if (!initialized.current) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    edited.current = true;
    saveLocally();

    const timer = window.setTimeout(() => {
      const currentValues = latestValues.current;
      const requests = STEPS.map((step, index) => {
        const stepId = stepIds[index];
        const stepValues = getDraftValuesForStep(
          { ...currentValues, districtId: latestDistrict.current },
          step,
        );
        if (Object.keys(stepValues).length === 0) return Promise.resolve();
        return apiPost(
          "/api/admission/drafts",
          {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "save", stepId, values: stepValues }),
          },
          { userId },
        ).then((response) => {
          if (!response.ok) throw new Error(`Draft save failed (${response.status}).`);
        });
      });
      void Promise.all(requests).catch((error: unknown) => {
        console.error("Could not save the admission draft to the server:", error);
      });
    }, 900);
    return () => window.clearTimeout(timer);
    // Dependencies are stable JSON snapshots of only the relevant values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stepIds, JSON.stringify(values), districtId]);

  return {
    saveNow: saveLocally,
    clear: () => {
      for (const stepId of stepIds) removeAdmissionDraft(userId, stepId);
    },
  };
}
