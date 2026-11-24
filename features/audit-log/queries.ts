import { Prisma } from "@/generated/prisma/client";
import { AUDIT_TABLES, type AuditModule } from "@/features/audit-log/labels";
import { prisma } from "@/lib/prisma";

/** Activities (one save each) per page. */
export const AUDIT_PAGE_SIZE = 20;
/** Changes listed per activity; bigger saves show a count of the rest. */
const CHANGES_PER_ACTIVITY = 50;

export type AuditLogFilters = {
  /** Free text: user, record name, description, or any changed value. */
  q?: string;
  action?: string;
  module?: AuditModule;
  table?: string;
  /** User account ID, or "system" for changes made without a signed-in user. */
  actor?: string;
  /** Inclusive dates, YYYY-MM-DD (Philippine time). */
  from?: string;
  to?: string;
  /** Changes of one record: table + record ID. */
  record?: string;
  /** Changes saved together in one database transaction. */
  tx?: string;
  page?: number;
};

export type AuditChange = {
  audit_id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  record_label: string | null;
  refs: Record<string, string> | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[];
  description: string | null;
};

/** Everything one user saved at once (one database transaction or sign-in event). */
export type AuditActivity = {
  key: string;
  occurred_at: string;
  transaction_id: string | null;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  user_agent: string | null;
  /** Changes in this activity that match the filters. */
  total: number;
  changes: AuditChange[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS = /^\d+$/;

function whereClause(filters: AuditLogFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  const q = filters.q?.trim();
  if (q) {
    const escaped = q.replace(/[\\%_]/g, (c) => "\\" + c);
    const like = `%${escaped}%`;
    conditions.push(Prisma.sql`(
      actor_name ILIKE ${like} OR actor_email ILIKE ${like} OR record_label ILIKE ${like}
      OR record_id ILIKE ${like} OR description ILIKE ${like} OR refs::text ILIKE ${like}
      OR old_data::text ILIKE ${like} OR new_data::text ILIKE ${like}
    )`);
  }
  if (filters.action) conditions.push(Prisma.sql`action = ${filters.action}`);
  if (filters.table) {
    conditions.push(Prisma.sql`table_name = ${filters.table}`);
  } else if (filters.module) {
    const tables = Object.entries(AUDIT_TABLES)
      .filter(([, info]) => info.module === filters.module)
      .map(([table]) => table);
    const inModule = tables.length ? Prisma.sql`table_name IN (${Prisma.join(tables)})` : Prisma.sql`FALSE`;
    conditions.push(filters.module === "Account" ? Prisma.sql`(table_name IS NULL OR ${inModule})` : inModule);
  }
  if (filters.actor === "system") {
    conditions.push(Prisma.sql`actor_id IS NULL AND actor_name IS NULL AND actor_email IS NULL`);
  } else if (filters.actor && DIGITS.test(filters.actor)) {
    conditions.push(Prisma.sql`actor_id = ${Number(filters.actor)}`);
  }
  if (filters.from && DATE.test(filters.from)) {
    conditions.push(Prisma.sql`occurred_at >= (${filters.from}::date::timestamp AT TIME ZONE 'Asia/Manila')`);
  }
  if (filters.to && DATE.test(filters.to)) {
    conditions.push(Prisma.sql`occurred_at < ((${filters.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`);
  }
  if (filters.record) conditions.push(Prisma.sql`record_id = ${filters.record}`);
  if (filters.tx && DIGITS.test(filters.tx)) {
    conditions.push(Prisma.sql`transaction_id = ${BigInt(filters.tx)}`);
  }

  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

// Timestamps are returned as UTC ISO text: the pg driver adapter drops the
// offset of timestamptz values, which shifts them by the server's time zone.
const OCCURRED_AT = Prisma.sql`to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at`;

type RawRow = Omit<AuditChange, "audit_id"> & {
  audit_id: bigint;
  gk: string;
  occurred_at: string;
  transaction_id: bigint | null;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  user_agent: string | null;
  size: bigint;
};

/** One page of activities, newest first, plus how many match in total. */
export async function getAuditActivities(filters: AuditLogFilters) {
  const where = whereClause(filters);
  const matched = Prisma.sql`
    SELECT l.*, coalesce('t' || l.transaction_id, 'e' || l.audit_id) AS gk
      FROM tbl_audit_log l ${where}`;

  const [{ total }] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(DISTINCT gk) AS total FROM (${matched}) m`;
  const count = Number(total);
  const totalPages = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = count
    ? await prisma.$queryRaw<RawRow[]>`
        WITH matched AS (${matched}),
        groups AS (
          SELECT gk, max(audit_id) AS last_id, count(*) AS size
            FROM matched GROUP BY gk
           ORDER BY last_id DESC
           LIMIT ${AUDIT_PAGE_SIZE} OFFSET ${(page - 1) * AUDIT_PAGE_SIZE}
        ),
        ranked AS (
          SELECT m.*, g.last_id, g.size,
                 row_number() OVER (PARTITION BY m.gk ORDER BY m.audit_id) AS rn
            FROM matched m JOIN groups g USING (gk)
        )
        SELECT audit_id, gk, ${OCCURRED_AT}, action, table_name, record_id, record_label, refs,
               actor_id, actor_name, actor_email, actor_role, user_agent, transaction_id,
               old_data, new_data, changed_fields, description, size
          FROM ranked
         WHERE rn <= ${CHANGES_PER_ACTIVITY}
         ORDER BY last_id DESC, audit_id`
    : [];

  const activities: AuditActivity[] = [];
  for (const row of rows) {
    let activity = activities.at(-1);
    if (activity?.key !== row.gk) {
      activity = {
        key: row.gk,
        occurred_at: row.occurred_at,
        transaction_id: row.transaction_id === null ? null : String(row.transaction_id),
        actor_id: row.actor_id,
        actor_name: row.actor_name,
        actor_email: row.actor_email,
        actor_role: row.actor_role,
        user_agent: row.user_agent,
        total: Number(row.size),
        changes: [],
      };
      activities.push(activity);
    }
    activity.changes.push({
      audit_id: String(row.audit_id),
      action: row.action,
      table_name: row.table_name,
      record_id: row.record_id,
      record_label: row.record_label,
      refs: row.refs,
      old_data: row.old_data,
      new_data: row.new_data,
      changed_fields: row.changed_fields,
      description: row.description,
    });
  }

  return { activities, total: count, page, totalPages };
}

/** Headline numbers for the page (Philippine time). */
export async function getAuditStats() {
  const [row] = await prisma.$queryRaw<
    { today: bigint; users_today: bigint; week: bigint; failed: bigint; total: bigint; last_at: string | null }[]
  >`
    WITH bounds AS (
      SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila' AS today
    )
    SELECT count(*) FILTER (WHERE occurred_at >= b.today AND table_name IS NOT NULL) AS today,
           count(DISTINCT actor_id) FILTER (WHERE occurred_at >= b.today) AS users_today,
           count(*) FILTER (WHERE occurred_at >= now() - interval '7 days' AND table_name IS NOT NULL) AS week,
           count(*) FILTER (WHERE action = 'LOGIN_FAILED' AND occurred_at >= now() - interval '7 days') AS failed,
           count(*) AS total,
           to_char(max(occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_at
      FROM tbl_audit_log, bounds b`;
  return {
    changesToday: Number(row.today),
    usersToday: Number(row.users_today),
    changesThisWeek: Number(row.week),
    failedSignIns: Number(row.failed),
    totalEntries: Number(row.total),
    lastRecordedAt: row.last_at,
  };
}

/** Accounts that appear in the log, for the user filter. */
export async function getAuditActors() {
  const rows = await prisma.$queryRaw<{ actor_id: number; actor_name: string | null }[]>`
    SELECT DISTINCT ON (actor_id) actor_id, actor_name
      FROM tbl_audit_log
     WHERE actor_id IS NOT NULL
     ORDER BY actor_id, audit_id DESC`;
  return rows
    .map((row) => ({ value: String(row.actor_id), label: row.actor_name ?? `User #${row.actor_id}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One change in a record's history, with who made it and when. */
export type AuditHistoryEntry = AuditChange & {
  occurred_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
};

const HISTORY_LIMIT = 200;

/** Every logged change of one record, newest first. */
export async function getRecordHistory(table: string, recordId: string) {
  const rows = await prisma.$queryRaw<(Omit<AuditHistoryEntry, "audit_id"> & { audit_id: bigint })[]>`
    SELECT audit_id, ${OCCURRED_AT}, action, table_name, record_id, record_label, refs,
           actor_name, actor_email, actor_role, old_data, new_data, changed_fields, description
      FROM tbl_audit_log
     WHERE table_name = ${table} AND record_id = ${recordId}
     ORDER BY audit_id DESC
     LIMIT ${HISTORY_LIMIT + 1}`;
  return {
    entries: rows.slice(0, HISTORY_LIMIT).map((row) => ({ ...row, audit_id: String(row.audit_id) })),
    truncated: rows.length > HISTORY_LIMIT,
  };
}
