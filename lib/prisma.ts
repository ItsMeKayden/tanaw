import { AsyncLocalStorage } from "node:async_hooks";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getAuditActor, type AuditActor } from "@/lib/audit-actor";

const globalForPrisma = globalThis as unknown as {
  /** Previous cache key, kept so an old cached client gets disconnected. */
  prisma: PrismaClient | undefined;
  prismaBase: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Audit log
//
// Database triggers record every change (migration 20261123120000_audit_log).
// They read the acting user from transaction-local settings, which are set
// here: each write runs in a transaction that first calls set_config(), and
// every $transaction() sets them once at the start.
// ---------------------------------------------------------------------------

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "$executeRaw",
  "$executeRawUnsafe",
]);

/**
 * Models whose writes skip the actor lookup. tbl_auth_session is written by
 * the auth.ts jwt callback, i.e. from inside auth(); looking up the actor
 * calls auth() again and the request never finishes. Session rows are not
 * audited (no trigger), so there is nothing to attribute.
 */
const UNAUDITED_MODELS = new Set(["tbl_audit_log", "tbl_auth_session"]);

/** Set while a $transaction() is running, so its queries are not re-wrapped. */
const transactionScope = new AsyncLocalStorage<true>();

type RawClient = Pick<PrismaClient, "$executeRaw">;

function setActorQuery(client: RawClient, actor: AuditActor) {
  return client.$executeRaw`SELECT
    set_config('tanaw.actor_id', ${actor.id === null ? "" : String(actor.id)}, true),
    set_config('tanaw.actor_name', ${actor.name ?? ""}, true),
    set_config('tanaw.actor_email', ${actor.email ?? ""}, true),
    set_config('tanaw.actor_role', ${actor.role ?? ""}, true),
    set_config('tanaw.user_agent', ${actor.userAgent ?? ""}, true)`;
}

function withAuditActor(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (
          !WRITE_OPERATIONS.has(operation) ||
          (model !== undefined && UNAUDITED_MODELS.has(model)) ||
          transactionScope.getStore()
        ) {
          return query(args);
        }

        const actor = await getAuditActor();
        if (!actor) return query(args);

        const [, result] = await base.$transaction([
          setActorQuery(base, actor),
          // The continuation is a lazy PrismaPromise and can join the batch.
          query(args) as unknown as ReturnType<PrismaClient["$executeRaw"]>,
        ]);
        return result;
      },
    },
  }) as unknown as PrismaClient;

  const $transaction = ((input: unknown, options?: unknown) =>
    transactionScope.run(true, async () => {
      const actor = await getAuditActor();

      if (typeof input === "function") {
        return extended.$transaction(async (tx) => {
          if (actor) await setActorQuery(tx, actor);
          return (input as (tx: unknown) => unknown)(tx);
        }, options as Parameters<PrismaClient["$transaction"]>[1]);
      }

      const queries = input as ReturnType<PrismaClient["$executeRaw"]>[];
      if (!actor) {
        return extended.$transaction(queries, options as { isolationLevel?: never });
      }
      const results = await extended.$transaction(
        [setActorQuery(base, actor), ...queries],
        options as { isolationLevel?: never },
      );
      return results.slice(1);
    })) as PrismaClient["$transaction"];

  return new Proxy(extended, {
    get(target, property, receiver) {
      if (property === "$transaction") return $transaction;
      return Reflect.get(target, property, receiver);
    },
  });
}

// In development the client is cached on globalThis so hot reloads do not
// open new connection pools. After `prisma generate`, the regenerated module
// exports a *new* PrismaClient class, but the cached instance still carries
// the old schema ("Unknown field ... for select statement" errors).
// Only reuse the cached client if it was built from the current class.
// The audit wrapper is cheap and rebuilt on every reload.
const cached = globalForPrisma.prismaBase ?? globalForPrisma.prisma;
const isCurrent = cached instanceof PrismaClient;

if (cached && !isCurrent) {
  void (cached as { $disconnect?: () => Promise<void> })
    .$disconnect?.()
    .catch(() => {});
}

const base = isCurrent ? cached : createPrismaClient();
const prisma = withAuditActor(base);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = base;
  globalForPrisma.prisma = undefined;
}

export { prisma };
