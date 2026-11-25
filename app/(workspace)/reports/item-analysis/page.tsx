import { connection } from "next/server";
import { BarChart3, ClipboardList, ListChecks, Users } from "lucide-react";

import { AutoSubmitSelect } from "@/components/reports/auto-submit-select";
import { StatCard } from "@/components/ui/stat-card";
import { tableStyles } from "@/components/ui/table-styles";
import { resolveCycle } from "@/features/admission/admission-stats";
import { toExamSet } from "@/features/admission/exam-scoring";
import { CHOICES, difficultyLabel, getItemAnalysis, type ItemStat } from "@/features/reports/item-analysis";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type SearchParams = { cycle?: string; set?: string; subject?: string };
type PageProps = Readonly<{ searchParams: Promise<SearchParams> }>;

const BAR = "#191e73";
const selectClass =
  "h-9 rounded-md border border-neutral-400 bg-white px-2.5 text-sm outline-none focus:border-[#191e73] focus:ring-2 focus:ring-[#191e73]/20";

function difficultyTone(p: number | null) {
  const label = difficultyLabel(p);
  if (label === "Easy") return "bg-green-100 text-green-800";
  if (label === "Moderate") return "bg-amber-100 text-amber-800";
  if (label === "Hard") return "bg-red-100 text-red-800";
  return "bg-neutral-100 text-neutral-600";
}

function Section({ title, description, children }: Readonly<{ title: string; description?: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-xl border border-neutral-300 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="font-semibold text-neutral-900">{title}</h2>
        {description && <p className="text-xs text-neutral-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Average % correct per subject: one horizontal bar each (single series, so
 * no legend), value labeled at the bar end, hover for the item count.
 */
function SubjectBars({ items }: Readonly<{ items: ItemStat[] }>) {
  const subjects = [...new Set(items.map((i) => i.subject))].map((subject) => {
    const answered = items.filter((i) => i.subject === subject && i.difficulty !== null);
    const average = answered.length
      ? Math.round(answered.reduce((s, i) => s + (i.difficulty ?? 0), 0) / answered.length)
      : null;
    return { subject, average, count: items.filter((i) => i.subject === subject).length };
  });

  return (
    <figure>
      <div className="relative">
        {/* Recessive grid at 0 / 25 / 50 / 75 / 100%, aligned with the bar track. */}
        <div className="pointer-events-none absolute inset-y-0 right-14 left-40" aria-hidden="true">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span key={tick} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: `${tick}%` }} />
          ))}
        </div>
        <ul className="relative space-y-3">
          {subjects.map((row) => (
            <li key={row.subject} className="group flex items-center gap-3">
              <span className="w-37 shrink-0 truncate text-sm text-neutral-800">{row.subject}</span>
              <span className="relative h-6 min-w-0 flex-1">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                  style={{ width: `${row.average ?? 0}%`, background: BAR }}
                />
                <span className="pointer-events-none absolute -top-8 left-0 z-10 hidden rounded-md bg-neutral-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg group-hover:block">
                  {row.subject}: {row.average === null ? "no answers" : `${row.average}% average`} · {row.count} questions
                </span>
              </span>
              <span className="w-11 shrink-0 text-right text-sm font-semibold text-neutral-900 tabular-nums">
                {row.average === null ? "—" : `${row.average}%`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 flex pr-14 pl-40 text-[10px] text-neutral-500 tabular-nums" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((tick, index) => (
          <span key={tick} className={`flex-1 ${index === 4 ? "text-right" : ""}`} style={index === 4 ? { flex: 0 } : undefined}>
            {tick}%
          </span>
        ))}
      </div>
      <figcaption className="sr-only">Average percent correct by subject</figcaption>
    </figure>
  );
}

function RankList({ rows }: Readonly<{ rows: ItemStat[] }>) {
  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <li key={row.question_id} className="flex items-center gap-3 text-sm">
          <span className="w-4 shrink-0 text-right text-xs text-neutral-400 tabular-nums">{index + 1}</span>
          <span className="w-12 shrink-0 font-semibold text-[#191e73] tabular-nums">Q{row.question_no}</span>
          <span className="w-28 shrink-0 truncate text-xs text-neutral-600">{row.subject}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${row.difficulty ?? 0}%`, background: BAR }} />
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums">
            {row.difficulty}%<span className="ml-1 text-[11px] text-neutral-500">{row.correct}/{row.answered}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ChoiceBoxes({ item }: Readonly<{ item: ItemStat }>) {
  return (
    <div className="flex items-center gap-1">
      {CHOICES.map((c) => {
        const isKey = c === item.correct_answer;
        return (
          <span
            key={c}
            title={`${c}: ${item.distribution[c]}${isKey ? " (correct answer)" : ""}`}
            className={`flex w-9 flex-col items-center rounded-md border py-0.5 leading-tight ${
              isKey ? "border-green-500 bg-green-50 text-green-900" : "border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            <span className="text-[10px] font-semibold">{c}</span>
            <span className="text-xs tabular-nums">{item.distribution[c]}</span>
          </span>
        );
      })}
      {item.distribution.blank > 0 && (
        <span className="ml-1 text-[11px] text-neutral-500 tabular-nums">{item.distribution.blank} blank</span>
      )}
    </div>
  );
}

export default async function ItemAnalysisPage({ searchParams }: PageProps) {
  await connection();
  await requirePermission("reports", "read");

  const params = await searchParams;
  const { cycles, cycle } = await resolveCycle(params.cycle);
  const set = toExamSet(params.set);
  const competencies = await prisma.tbl_competency.findMany({
    orderBy: { competency_name: "asc" },
    select: { competency_id: true, competency_name: true },
  });
  const competencyId =
    params.subject && params.subject !== "all" && Number.isSafeInteger(Number(params.subject)) ? Number(params.subject) : null;

  const { exam, items, examinees } = cycle
    ? await getItemAnalysis({ cycleId: cycle.cycle_id, set, competencyId })
    : { exam: null, items: [] as ItemStat[], examinees: 0 };

  const withData = items.filter((i) => i.difficulty !== null);
  const average = withData.length
    ? Math.round(withData.reduce((sum, i) => sum + (i.difficulty ?? 0), 0) / withData.length)
    : null;
  const byDifficulty = [...withData].sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0));

  return (
    <div className="min-h-full space-y-4 bg-neutral-50/60 p-3 sm:p-5">
      <header>
        <h1 className="text-xl font-bold text-neutral-900">Item Analysis</h1>
        <p className="text-sm text-neutral-600">
          How each exam question performed: how many got it right, whether it separates strong from weak examinees,
          and which choices they picked.
        </p>
      </header>

      {/* Filters apply as soon as one changes. */}
      <form
        action="/reports/item-analysis"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-3 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          School year
          <AutoSubmitSelect name="cycle" defaultValue={cycle ? String(cycle.cycle_id) : ""} className={`${selectClass} w-44`}>
            {cycles.map((c) => (
              <option key={c.cycle_id} value={String(c.cycle_id)}>
                S.Y. {c.school_year}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Exam set
          <AutoSubmitSelect name="set" defaultValue={set} className={`${selectClass} w-28`}>
            <option value="A">Set A</option>
            <option value="B">Set B</option>
          </AutoSubmitSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Subject
          <AutoSubmitSelect
            name="subject"
            defaultValue={competencyId ? String(competencyId) : "all"}
            className={`${selectClass} w-48`}
          >
            <option value="all">All subjects</option>
            {competencies.map((c) => (
              <option key={c.competency_id} value={String(c.competency_id)}>
                {c.competency_name}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <noscript>
          <button type="submit" className="h-9 rounded-md bg-[#191e73] px-4 text-sm font-semibold text-white">
            Apply
          </button>
        </noscript>
      </form>

      {!exam || items.length === 0 ? (
        <p className="rounded-xl border border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
          {exam ? `Set ${set} has no questions${competencyId ? " for this subject" : ""}.` : "No exam exists for this school year yet."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={ListChecks} label="Items" value={items.length} note={`Set ${set}`} />
            <StatCard icon={Users} label="Examinees" value={examinees} note="with scanned answers" tone="info" />
            <StatCard
              icon={BarChart3}
              label="Average correct"
              value={average === null ? "—" : `${average}%`}
              note={average === null ? null : difficultyLabel(average)}
              tone="success"
            />
          </div>

          {withData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-400 bg-white px-6 py-12 text-center">
              <ClipboardList className="mx-auto size-8 text-neutral-400" aria-hidden="true" />
              <p className="mt-2 font-medium">No answers recorded yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
                Item analysis uses each applicant&apos;s answer per question. They are saved when scanned answer sheets
                are imported on Exam Scores (&ldquo;Import scanned results&rdquo;).
              </p>
            </div>
          ) : (
            <>
              <Section title="Average correct by subject" description="Share of correct answers per subject. Hover a bar for details.">
                <SubjectBars items={items} />
              </Section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Hardest questions" description="Lowest share of correct answers">
                  <RankList rows={byDifficulty.slice(0, 5)} />
                </Section>
                <Section title="Easiest questions" description="Highest share of correct answers">
                  <RankList rows={byDifficulty.slice(-5).reverse()} />
                </Section>
              </div>

              <Section
                title="Item details"
                description="% correct per question and how many examinees picked each choice. The green box is the correct answer."
              >
                  <div className={`${tableStyles.wrap} max-h-[70vh] overflow-y-auto`}>
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className={tableStyles.headRow}>
                          <th className={`${tableStyles.th} w-14`}>Q#</th>
                          <th className={tableStyles.th}>Question</th>
                          <th className={`${tableStyles.th} w-44`}>Correct</th>
                          <th className={`${tableStyles.th} w-56`}>Choices picked</th>
                        </tr>
                      </thead>
                      <tbody className={tableStyles.body}>
                        {items.map((item) => {
                          return (
                            <tr key={item.question_id} className={`${tableStyles.row} align-top`}>
                              <td className={`${tableStyles.td} font-semibold text-[#191e73] tabular-nums`}>Q{item.question_no}</td>
                              <td className={`${tableStyles.td} max-w-sm`}>
                                <span className="line-clamp-2 text-neutral-900" title={item.question_text ?? undefined}>
                                  {item.question_text ?? <span className="text-neutral-400 italic">Answer key only</span>}
                                </span>
                                <span className="text-xs text-neutral-500">{item.subject}</span>
                              </td>
                              <td className={tableStyles.td}>
                                {item.difficulty === null ? (
                                  <span className="text-xs text-neutral-400">No answers</span>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="h-2 w-20 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                                        <span className="block h-full rounded-full" style={{ width: `${item.difficulty}%`, background: BAR }} />
                                      </span>
                                      <span className="text-sm font-medium tabular-nums">{item.difficulty}%</span>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${difficultyTone(item.difficulty)}`}>
                                      {difficultyLabel(item.difficulty)}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className={tableStyles.td}>
                                <ChoiceBoxes item={item} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
