/*
 * Loading skeletons shaped like each module's pages. Used as the <Suspense>
 * fallback of every workspace page, so the page layout appears instantly and
 * fills in when the data arrives. Server-safe (no client code).
 */
import type { ReactNode } from "react";

/** One shimmering placeholder block. */
export function Skeleton({ className = "", style }: Readonly<{ className?: string; style?: React.CSSProperties }>) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-pulse rounded-md bg-neutral-200/80 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Page frame: same padding as the real pages, announced once to screen readers. */
function Frame({ children, label, compact = false }: Readonly<{ children: ReactNode; label: string; compact?: boolean }>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`min-h-full ${compact ? "space-y-3 p-3 sm:p-4" : "space-y-5 p-4 sm:p-6"}`}
    >
      <span className="sr-only">Loading {label}…</span>
      {children}
    </div>
  );
}

const card = "rounded-xl border border-neutral-300 bg-white/90";

function Header({ actions = 0 }: Readonly<{ actions?: number }>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="w-full max-w-xl space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-36 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCards({ count }: Readonly<{ count: number }>) {
  const cols = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5" }[
    count
  ];
  return (
    <div className={`grid gap-3 ${cols ?? "sm:grid-cols-3"}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${card} flex items-start gap-3 p-4`}>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Toolbar({ chips = 0 }: Readonly<{ chips?: number }>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-full" />
        {Array.from({ length: chips }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-36 rounded-full" />
    </div>
  );
}

function Table({ rows = 8, cols = 6 }: Readonly<{ rows?: number; cols?: number }>) {
  return (
    <div className="overflow-hidden rounded-sm border border-neutral-300 bg-white/90">
      <div className="grid gap-4 bg-[#b4b7f3]/40 px-3 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-4 w-3/4 bg-[#b4b7f3]/70" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid gap-4 border-t border-neutral-200 px-3 py-3.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? "w-5/6" : (r + c) % 3 === 0 ? "w-1/2" : "w-2/3"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Pager() {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-52" />
    </div>
  );
}

function Panel({ className = "", lines = 4, title = true }: Readonly<{ className?: string; lines?: number; title?: boolean }>) {
  return (
    <div className={`${card} space-y-3 p-4 ${className}`}>
      {title && <Skeleton className="h-5 w-40" />}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

function ProfileHeader() {
  return (
    <div className={`${card} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page skeletons, one per page type                                   */
/* ------------------------------------------------------------------ */

/** Lists: Applicants, Archive History, Enrollment Verification, User Accounts, Map list, Recommendations. */
export function TablePageSkeleton({
  label,
  stats = 0,
  chips = 0,
  cols = 6,
  actions = 0,
}: Readonly<{ label: string; stats?: number; chips?: number; cols?: number; actions?: number }>) {
  return (
    <Frame label={label}>
      <Header actions={actions} />
      {stats > 0 && <StatCards count={stats} />}
      <Toolbar chips={chips} />
      <Table cols={cols} />
      <Pager />
    </Frame>
  );
}

/** Applicant / enrollment / recommendation detail pages. */
export function ProfileSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <Frame label={label}>
      <Skeleton className="h-4 w-36" />
      <ProfileHeader />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel lines={6} />
        <Panel lines={6} />
      </div>
    </Frame>
  );
}

/** Add / edit applicant form pages. */
export function FormSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <Frame label={label}>
      <Skeleton className="h-4 w-36" />
      <Header />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-2 flex-1 rounded-full" />
        ))}
      </div>
      <div className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Exam Schedule: sessions table beside the attendance panel. */
export function ExamScheduleSkeleton() {
  return (
    <Frame label="exam schedule" compact>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={`${card} space-y-3 p-4`}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
          <Table rows={6} cols={6} />
        </div>
        <div className={`${card} space-y-3 p-4`}>
          <Skeleton className="h-6 w-52" />
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Grid editors: Exam Scores, Quota, Roles & Permissions, Mapping Settings. */
export function GridEditorSkeleton({
  label,
  cols = 7,
  rows = 7,
  banner = false,
}: Readonly<{ label: string; cols?: number; rows?: number; banner?: boolean }>) {
  return (
    <Frame label={label}>
      <Header />
      {banner && <Skeleton className="h-16 w-full rounded-xl" />}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-44 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <Table rows={rows} cols={cols} />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
    </Frame>
  );
}

/** Score Breakdown and Course Comparison: filters, chart, and a side panel. */
export function ChartPageSkeleton({ label, radar = false }: Readonly<{ label: string; radar?: boolean }>) {
  return (
    <Frame label={label}>
      <Header />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} space-y-4 p-4`}>
          <Skeleton className="h-5 w-56" />
          {radar ? (
            <Skeleton className="mx-auto aspect-square w-full max-w-xs rounded-full" />
          ) : (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <div className="space-y-1">
                  <Skeleton className="h-3" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
                  <Skeleton className="h-3" style={{ width: `${70 - ((i * 11) % 20)}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
        <Panel lines={7} />
      </div>
    </Frame>
  );
}

/** Map overview: filters, the map, then two summary panels. */
export function MapSkeleton() {
  return (
    <Frame label="map" compact>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-40 rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[420px] w-full rounded-xl" />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel lines={5} />
        <Panel lines={5} />
      </div>
    </Frame>
  );
}

/** Simple module pages (Dashboard, Analytics). */
export function OverviewSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <Frame label={label}>
      <Header />
      <StatCards count={4} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Panel lines={6} />
      </div>
    </Frame>
  );
}
