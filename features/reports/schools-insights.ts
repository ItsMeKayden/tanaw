// Plain-language insights for the Schools & Passing Rate cards. Each returns
// null when there is nothing to say.
import { fmt, percent, plural, type Insight } from "@/features/reports/insight";
import { MIN_EXAMINEES_FOR_RATE, type SchoolsReport } from "@/features/reports/schools";
import { pct } from "@/features/reports/stats";

/** Course pass rates closer than this many points are described as "about the same". */
const SIMILAR_GAP = 5;

const points = (value: number) => `${value.toFixed(1)} points`;

/** Pass rate, and passers stuck on the waiting list. */
export function overallInsight(d: SchoolsReport): Insight | null {
  if (d.examinees === 0) return null;
  if (d.waitlisted > 0) {
    return {
      tone: "attention",
      text: `${plural(d.waitlisted, "passer")} ${d.waitlisted === 1 ? "is" : "are"} waitlisted because their course quota is full. Admit them from Additional Applicants when slots open.`,
    };
  }
  return d.passingRate >= 50
    ? { tone: "positive", text: `${fmt(d.passed)} of ${fmt(d.examinees)} examinees passed (${percent(d.passingRate)}), and no passer is waiting for a slot.` }
    : { tone: "attention", text: `Fewer than half of the examinees passed: ${percent(d.passingRate)}, with ${plural(d.failed, "examinee")} below the passing score.` };
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Every item sharing the top value (the list must already be sorted by it, highest first). */
function leaders<T>(sorted: T[], value: (item: T) => number) {
  return sorted.filter((item) => value(item) === value(sorted[0]));
}

/** Best and weakest course, among courses with enough examinees for a fair rate. */
export function courseInsight(d: SchoolsReport): Insight | null {
  if (d.courses.length === 0) return null;
  const qualified = d.courses.filter((c) => c.examinees >= MIN_EXAMINEES_FOR_RATE);
  if (qualified.length < 2) {
    return {
      tone: "neutral",
      text:
        d.courses.length === 1
          ? `Only ${d.courses[0].code} has examinees so far: ${fmt(d.courses[0].passed)} of ${fmt(d.courses[0].examinees)} passed.`
          : `Most courses have fewer than ${MIN_EXAMINEES_FOR_RATE} examinees so far, too few to compare pass rates fairly.`,
    };
  }
  const best = qualified[0];
  const weakest = qualified.at(-1)!;
  const note = qualified.length < d.courses.length ? ` Courses with fewer than ${MIN_EXAMINEES_FOR_RATE} examinees are left out of this comparison.` : "";
  const spread = best.passingRate - weakest.passingRate;
  if (spread < SIMILAR_GAP) {
    return {
      tone: "neutral",
      text: `Pass rates are about the same across courses, from ${percent(weakest.passingRate)} to ${percent(best.passingRate)}.${note}`,
    };
  }
  return {
    tone: weakest.passingRate < 50 ? "attention" : "neutral",
    text:
      `${best.code} has the highest pass rate (${percent(best.passingRate)}, ${fmt(best.passed)} of ${fmt(best.examinees)}) and ${weakest.code} the lowest ` +
      `(${percent(weakest.passingRate)}, ${fmt(weakest.passed)} of ${fmt(weakest.examinees)}), a gap of ${points(spread)}.${note}`,
  };
}

/** Public vs private pass rates. */
export function typeInsight(d: SchoolsReport): Insight | null {
  const [pub, priv] = d.types;
  if (pub.examinees === 0 && priv.examinees === 0) return null;
  if (pub.examinees === 0 || priv.examinees === 0) {
    const only = pub.examinees ? pub : priv;
    return { tone: "neutral", text: `Only ${only.type.toLowerCase()}-school applicants have taken the exam so far, so there is nothing to compare yet.` };
  }
  const difference = pub.passingRate - priv.passingRate;
  if (Math.abs(difference) < SIMILAR_GAP) {
    return {
      tone: "neutral",
      text: `Public and private-school examinees passed at about the same rate (${percent(pub.passingRate)} vs ${percent(priv.passingRate)}).`,
    };
  }
  const [higher, lower] = difference > 0 ? [pub, priv] : [priv, pub];
  return {
    tone: "neutral",
    text:
      `${higher.type}-school examinees passed at a higher rate: ${percent(higher.passingRate)} vs ${percent(lower.passingRate)} ` +
      `for ${lower.type.toLowerCase()} schools, a gap of ${points(Math.abs(difference))}.`,
  };
}

/** Where applicants come from. */
export function applicantsInsight(d: SchoolsReport): Insight | null {
  const top = d.mostApplicants[0];
  if (!top || d.applicants === 0) return null;
  const tied = leaders(d.mostApplicants, (s) => s.applicants);
  const lead =
    tied.length === 1
      ? `${top.name} sent the most applicants (${fmt(top.applicants)}).`
      : tied.length <= 3
        ? `${listNames(tied.map((s) => s.name))} tied for the most applicants (${fmt(top.applicants)} each).`
        : `${tied.length} schools tied for the most applicants (${fmt(top.applicants)} each).`;
  // The share of the leading group: the tied leaders, or the top 3 when there is a clear order.
  const group = tied.length >= 3 ? tied : d.mostApplicants.slice(0, 3);
  const groupShare = percent(pct(group.reduce((sum, s) => sum + s.applicants, 0), d.applicants));
  return {
    tone: "neutral",
    text:
      d.schoolCount <= 3
        ? `${lead} ${tied.length > 1 ? "Each is" : "That is"} ${percent(pct(top.applicants, d.applicants))} of all ${fmt(d.applicants)} applicants.`
        : tied.length >= 3
          ? `${lead} Together they sent ${groupShare} of all ${fmt(d.applicants)} applicants.`
          : `${lead} The top 3 schools account for ${groupShare} of all ${fmt(d.applicants)} applicants.`,
  };
}

/** Most passers, and the best pass rate among schools with enough examinees. */
export function passersInsight(d: SchoolsReport): Insight | null {
  const top = d.mostPassers[0];
  if (!top) return null;
  const qualified = d.schools.filter((s) => s.examinees >= MIN_EXAMINEES_FOR_RATE);
  const bestRate = qualified.sort((a, b) => b.passingRate - a.passingRate || b.examinees - a.examinees)[0];
  const tied = leaders(d.mostPassers, (s) => s.passed);
  const lead =
    tied.length === 1
      ? `${top.name} produced the most passers (${fmt(top.passed)} of ${fmt(top.examinees)} examinees).`
      : tied.length <= 3
        ? `${listNames(tied.map((s) => s.name))} tied for the most passers (${fmt(top.passed)} each).`
        : `${tied.length} schools tied for the most passers (${fmt(top.passed)} each).`;
  if (!bestRate || (tied.length === 1 && bestRate.name === top.name)) return { tone: "positive", text: lead };
  const bestTied = qualified.filter((s) => s.passingRate === bestRate.passingRate);
  const bestNames =
    bestTied.length === 1
      ? `${bestRate.name} has`
      : bestTied.length <= 3
        ? `${listNames(bestTied.map((s) => s.name))} share`
        : `${bestTied.length} schools share`;
  return {
    tone: "positive",
    text: `${lead} Among schools with at least ${MIN_EXAMINEES_FOR_RATE} examinees, ${bestNames} the highest pass rate (${percent(bestRate.passingRate)}).`,
  };
}
