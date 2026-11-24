import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Activity, CalendarDays, Clock, Database, Lock, ScrollText, ShieldAlert, Users } from "lucide-react";

import { QcuWatermark } from "@/components/admission/qcu-watermark";
import { Pagination } from "@/components/ui/pagination";
import { TablePageSkeleton } from "@/components/ui/skeletons";
import { fullDateTime } from "@/components/user-management/audit-change";
import { AuditLogFilterBar } from "@/components/user-management/audit-log-filters";
import { AuditLogTimeline } from "@/components/user-management/audit-log-timeline";
import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_TABLES, tableInfo, type AuditModule } from "@/features/audit-log/labels";
import {
  AUDIT_PAGE_SIZE,
  getAuditActivities,
  getAuditActors,
  getAuditStats,
  type AuditLogFilters,
} from "@/features/audit-log/queries";
import { getRoleLabels } from "@/features/user-management/role-labels";
import { requirePermission } from "@/lib/authorization";

const PARAMS = ["q", "action", "module", "actor", "from", "to", "table", "record", "tx", "page"] as const;
type SearchParams = Partial<Record<(typeof PARAMS)[number], string>>;
type PageProps = Readonly<{ searchParams: Promise<SearchParams> }>;

const BASE = "/user-management/audit-log";

function hrefWith(params: SearchParams, changes: SearchParams) {
  const query = new URLSearchParams();
  for (const key of PARAMS) {
    const value = key in changes ? changes[key] : params[key];
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${BASE}?${text}` : BASE;
}

/** YYYY-MM-DD in Philippine time, `daysAgo` days before today. */
function manilaDate(daysAgo = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(Date.now() - daysAgo * 86_400_000));
}

/** "just now", "5 minutes ago", "3 hours ago", or the full date for older times. */
function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return relative.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 7 * 86_400) return relative.format(-Math.floor(seconds / 86_400), "day");
  return fullDateTime.format(new Date(iso));
}

async function AuditLogContent({ searchParams }: PageProps) {
  await connection();
  await requirePermission("audit", "read");

  const params = await searchParams;
  // "module" is a whole module ("Admission") or one record type in it ("tbl_applicant").
  const moduleParam = params.module ?? "";
  const filters: AuditLogFilters = {
    q: params.q,
    action: params.action && params.action in AUDIT_ACTIONS ? params.action : undefined,
    module: (AUDIT_MODULES as readonly string[]).includes(moduleParam) ? (moduleParam as AuditModule) : undefined,
    table: params.table || (moduleParam in AUDIT_TABLES ? moduleParam : undefined),
    actor: params.actor || undefined,
    from: params.from,
    to: params.to,
    record: params.record || undefined,
    tx: params.tx || undefined,
    page: Number(params.page) || 1,
  };

  const [log, stats, actors, roleLabels] = await Promise.all([
    getAuditActivities(filters),
    getAuditStats(),
    getAuditActors(),
    getRoleLabels(),
  ]);

  const start = log.total === 0 ? 0 : (log.page - 1) * AUDIT_PAGE_SIZE + 1;
  const end = Math.min(log.page * AUDIT_PAGE_SIZE, log.total);
  const today = manilaDate();
  const presets = [
    { label: "Today", from: today },
    { label: "Last 7 days", from: manilaDate(6) },
    { label: "Last 30 days", from: manilaDate(29) },
  ];

  return (
    <div className="relative isolate min-h-full space-y-5 p-4 sm:p-6">
      <QcuWatermark />
      <header className="overflow-hidden rounded-xl border border-neutral-400 bg-white/90">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#191e73] text-white shadow-sm">
              <ScrollText className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold tracking-wide text-[#191e73]/80 uppercase">User Management</p>
              <h1 className="text-2xl leading-tight font-bold tracking-tight">Audit Log</h1>
              <p className="max-w-3xl text-sm text-neutral-700">
                Every change made in the system — who made it, when, and exactly what changed — plus sign-ins and
                sign-outs.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 sm:min-w-56">
            <Clock className="size-5 shrink-0 text-[#191e73]/70" aria-hidden="true" />
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-medium text-neutral-500">Last activity</p>
              {stats.lastRecordedAt ? (
                <>
                  <p className="text-sm font-semibold text-neutral-900 first-letter:uppercase">
                    <time dateTime={stats.lastRecordedAt}>{timeAgo(stats.lastRecordedAt)}</time>
                  </p>
                  <p className="text-xs text-neutral-600">{fullDateTime.format(new Date(stats.lastRecordedAt))}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-neutral-900">Nothing recorded yet</p>
              )}
            </div>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-200 bg-neutral-50/80 px-4 py-2.5 text-xs text-neutral-600 sm:px-5">
          <div className="flex items-center gap-1.5">
            <Database className="size-3.5" aria-hidden="true" />
            <dt>Total entries:</dt>
            <dd className="font-medium text-neutral-900 tabular-nums">{stats.totalEntries.toLocaleString("en-US")}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            <dt className="sr-only">Protection:</dt>
            <dd>Entries cannot be edited or deleted, even by administrators.</dd>
          </div>
        </dl>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Changes today", value: stats.changesToday, icon: Activity },
          { label: "Active users today", value: stats.usersToday, icon: Users },
          { label: "Changes (7 days)", value: stats.changesThisWeek, icon: CalendarDays },
          {
            label: "Failed sign-ins (7 days)",
            value: stats.failedSignIns,
            icon: ShieldAlert,
            alert: stats.failedSignIns > 0,
            href: hrefWith({}, { action: "LOGIN_FAILED", from: manilaDate(6) }),
          },
        ].map((stat) => {
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-800">{stat.label}</p>
                <stat.icon
                  className={`size-5 ${stat.alert ? "text-amber-600" : "text-[#191e73]/70"}`}
                  aria-hidden="true"
                />
              </div>
              <p className={`text-3xl font-semibold tabular-nums ${stat.alert ? "text-amber-700" : ""}`}>
                {stat.value.toLocaleString("en-US")}
              </p>
            </>
          );
          const card = "block rounded-xl border border-neutral-400 bg-white/90 p-4";
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className={`${card} hover:border-[#191e73]`}>
              {body}
            </Link>
          ) : (
            <div key={stat.label} className={card}>
              {body}
            </div>
          );
        })}
      </div>

      <AuditLogFilterBar
        key={JSON.stringify(params)}
        values={{ ...params, module: moduleParam || undefined }}
        actors={actors}
        today={today}
        presets={presets}
        total={log.total}
      />

      {(params.record || params.tx) && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#191e73]/30 bg-[#e3e4f8] px-3 py-2 text-sm">
          <span>
            {params.record
              ? `Showing the full history of one ${tableInfo(params.table ?? null).label.toLowerCase()}.`
              : "Showing every change from one save."}
          </span>
          <Link href={BASE} className="font-medium text-[#191e73] underline">
            Back to all activity
          </Link>
        </p>
      )}

      <AuditLogTimeline activities={log.activities} roleLabels={roleLabels} />

      <Pagination
        page={log.page}
        totalPages={log.totalPages}
        start={start}
        end={end}
        total={log.total}
        noun="activities"
        prevHref={log.page > 1 ? hrefWith(params, { page: String(log.page - 1) }) : null}
        nextHref={log.page < log.totalPages ? hrefWith(params, { page: String(log.page + 1) }) : null}
      />
    </div>
  );
}

export default function AuditLogPage(props: PageProps) {
  return (
    <Suspense fallback={<TablePageSkeleton label="audit log" stats={4} cols={4} />}>
      <AuditLogContent {...props} />
    </Suspense>
  );
}
