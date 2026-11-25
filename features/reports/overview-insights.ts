// Plain-language insights for the Analytics → Overview cards, generated from the
// same figures the charts show. Each returns null when there is nothing to say.
import type { getOverview } from "@/features/reports/overview";
import { NEAR_MISS_MARGIN, pct } from "@/features/reports/overview";

export type InsightTone = "positive" | "attention" | "neutral";
export type Insight = { tone: InsightTone; text: string };

type Overview = Awaited<ReturnType<typeof getOverview>>;

/** Subjects closer than this many points are described as "about the same". */
const SIMILAR_SUBJECTS_GAP = 5;

const fmt = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${value.toFixed(1)}%`;
const plural = (count: number, one: string, many = `${one}s`) => `${fmt(count)} ${count === 1 ? one : many}`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

/** Where the pipeline loses the most applicants. */
export function pipelineInsight(d: Overview): Insight | null {
  if (d.applicants === 0) return null;
  const steps = [
    { key: "exam", rate: pct(d.examinees, d.applicants), applies: true },
    { key: "pass", rate: pct(d.passed, d.examinees), applies: d.examinees > 0 },
    { key: "enroll", rate: pct(d.enrolled, d.passed), applies: d.passed > 0 },
  ].filter((step) => step.applies);
  const weakest = steps.reduce((low, step) => (step.rate < low.rate ? step : low));

  if (weakest.rate >= 80) {
    return { tone: "positive", text: "Most applicants are moving through every step; no step loses more than 20% of them." };
  }
  switch (weakest.key) {
    case "exam": {
      const waiting = d.applicants - d.examinees;
      return {
        tone: "attention",
        text: `${plural(waiting, "applicant")} (${percent(pct(waiting, d.applicants))}) have not taken the exam yet, the biggest gap in the pipeline.`,
      };
    }
    case "pass":
      return {
        tone: "attention",
        text: `The exam is the biggest drop-off: ${percent(weakest.rate)} of examinees passed (${fmt(d.passed)} of ${fmt(d.examinees)}).`,
      };
    default:
      return {
        tone: "attention",
        text: `Only ${fmt(d.enrolled)} of ${plural(d.passed, "passer")} (${percent(weakest.rate)}) have enrolled so far. The rest are still pending in Enrollment Verification.`,
      };
  }
}

/** Pass rate, and passers stuck on the waiting list. */
export function resultsInsight(d: Overview): Insight | null {
  if (d.examinees === 0) return null;
  if (d.waitlisted > 0) {
    return {
      tone: "attention",
      text: `${plural(d.waitlisted, "passer")} ${d.waitlisted === 1 ? "is" : "are"} waitlisted because their course quota is full. Admit them from Additional Applicants when slots open.`,
    };
  }
  if (d.passingRate >= 50) {
    return {
      tone: "positive",
      text: `${fmt(d.passed)} of ${fmt(d.examinees)} examinees passed (${percent(d.passingRate)}), and no passer is waiting for a slot.`,
    };
  }
  return {
    tone: "attention",
    text: `Fewer than half of the examinees passed: ${percent(d.passingRate)}, with ${plural(d.failed, "examinee")} below the passing score.`,
  };
}

/** Near misses around the passing score, otherwise where most scores fall. */
export function distributionInsight(d: Overview): Insight | null {
  if (d.examinees === 0) return null;
  if (d.passingRule && d.nearMiss > 0) {
    const unit = d.passingRule.byPoints ? "points" : "percentage points";
    const mark = d.passingRule.byPoints ? `${d.passingRule.value} points` : `${d.passingRule.value}%`;
    return {
      tone: "attention",
      text: `${plural(d.nearMiss, "examinee")} failed by less than ${NEAR_MISS_MARGIN} ${unit} (passing score: ${mark}). They are the ones most affected by any change to the passing score.`,
    };
  }
  const busiest = d.bins.reduce((top, bin) => {
    const total = bin.values.passed + bin.values.failed;
    return total > top.total ? { label: bin.label, total } : top;
  }, { label: "", total: 0 });
  return {
    tone: "neutral",
    text: `Scores cluster in the ${busiest.label}% range (${fmt(busiest.total)} of ${fmt(d.examinees)} examinees). Half scored ${d.stats.median.toFixed(1)} or higher.`,
  };
}

/** Change between the two most recent school years that have results. */
export function trendInsight(d: Overview): Insight | null {
  const years = d.yearly.filter((year) => year.passingRate !== null && year.average !== null);
  if (years.length === 0) return null;
  if (years.length === 1) {
    return {
      tone: "neutral",
      text: `Only ${years[0].label} has exam results so far. Trends will show once another school year has results.`,
    };
  }
  const [before, latest] = years.slice(-2);
  const rateChange = latest.passingRate! - before.passingRate!;
  const averageChange = latest.average! - before.average!;
  const direction = (change: number) => (change > 0.05 ? "rose" : change < -0.05 ? "fell" : "held steady");
  return {
    tone: rateChange > 0.05 ? "positive" : rateChange < -0.05 ? "attention" : "neutral",
    text:
      `From ${before.label} to ${latest.label}, the passing rate ${direction(rateChange)} ` +
      `(${percent(before.passingRate!)} → ${percent(latest.passingRate!)}, ${signed(rateChange)} pts) and the average score ` +
      `${direction(averageChange)} (${before.average!.toFixed(1)} → ${latest.average!.toFixed(1)}).`,
  };
}

/** Weakest and strongest subject. */
export function subjectInsight(d: Overview): Insight | null {
  if (d.subjects.length === 0) return null;
  if (d.subjects.length === 1) {
    return { tone: "neutral", text: `Only ${d.subjects[0].label} has per-question answers so far.` };
  }
  const strongest = d.subjects[0];
  const weakest = d.subjects.at(-1)!;
  const gap = strongest.value - weakest.value;
  if (gap < SIMILAR_SUBJECTS_GAP && weakest.value >= 50) {
    return {
      tone: "neutral",
      text: `Examinees scored about the same in every subject, from ${percent(weakest.value)} (${weakest.label}) to ${percent(strongest.value)} (${strongest.label}).`,
    };
  }
  return {
    tone: weakest.value < 50 ? "attention" : "neutral",
    text:
      `Examinees did worst in ${weakest.label} (${percent(weakest.value)}) and best in ${strongest.label} (${percent(strongest.value)}), ` +
      `a ${gap.toFixed(1)}-point gap.${weakest.value < 50 ? ` Fewer than half the ${weakest.label} points were earned.` : ""}`,
  };
}
