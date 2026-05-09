# SQLite Migration Plan

## Overview

Migrate the Bluesky Hebrew Feed Generator from PostgreSQL (`pg` + `PostgresDialect`) to SQLite (`better-sqlite3` + `SqliteDialect`).

**Key decisions:**
- Preserve all existing data (posts, cursors, notified users, filtered users).
- Squash the 15 existing migrations into a single SQLite-compatible init migration.
- Application query changes are still required because `DISTINCT ON` is PostgreSQL-specific.

---

## Performance Analysis

**Current load:**
- INSERTs: 4.5 posts/minute (0.075/sec)
- SELECTs: 15 feed generations/minute (0.25/sec)

**Verdict:** `better-sqlite3` is more than sufficient. This load is extraordinarily low for any database. SQLite with WAL mode easily handles 1,000+ writes/sec and 100,000+ reads/sec.

**Why `better-sqlite3` over alternatives:**
- **Synchronous API:** At 0.075 writes/sec, the event loop will never block.
- **WAL mode:** Readers don't block writers. Feed generation won't stall on firehose indexing or blocklist updates.
- **No connection overhead:** No TCP, auth, or pooling. Latency is filesystem latency (microseconds).
- **No ORM/driver mismatch:** Kysely has first-class `SqliteDialect` support.

**Alternatives considered:**
| Alternative | Why Not Used |
|-------------|--------------|
| Turso/libsql | Adds network latency and complexity for zero benefit at 15 reads/min. |
| `node-sqlite3` | Async API with queue overhead; `better-sqlite3` is faster for single-machine workloads. |
| DuckDB | Analytical column-store; terrible for transactional upserts and indexing. |
| Keep PostgreSQL | Works, but operational cost (hosting, SSL, connection management) for unused capacity. |

---

## Phase 1: Dependencies & Configuration

### 1.1 Package Changes (`package.json`)

Remove:
- `pg`
- `@types/pg`

Add:
- `better-sqlite3`

(`@types/better-sqlite3` is already in `devDependencies`.)

### 1.2 Environment Variables (`src/config.ts`)

Replace:
```typescript
POSTGRES_CONNECTION_STRING: z.string(),
POSTGRES_CA_CERT_FILEPATH: z.string().optional(),
```

With:
```typescript
SQLITE_DATABASE_PATH: z.string().default('./data/feed.db'),
```

Update `.env`:
```bash
SQLITE_DATABASE_PATH="./data/feed.db"
```

### 1.3 Database Connection (`src/db/index.ts`)

Replace `PostgresDialect` with `SqliteDialect`. Enable WAL mode immediately:

```typescript
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

const sqlite = new Database(cfg.SQLITE_DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');

return new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({ database: sqlite }),
  plugins: [createMonitoringPlugin(database_operation_duration)],
});
```

Remove connection pooling logic — SQLite is a single file, single connection.

---

## Phase 2: Squashed Schema & Migrations

### 2.1 New `src/db/migrations.ts`

Replace all 15 migrations with a single `001_init` migration that creates the final schema:

- `post` table with all final columns (`uri` PK, `author`, `cid`, `indexedAt`, `createdAt`, `effectiveTimestamp`, `replyRoot`, `replyTo`, `language`)
- `sub_state` (`service` PK, `cursor` varchar)
- `notified_users` (`did` PK, `notifiedAt` with `DEFAULT CURRENT_TIMESTAMP`)
- `filtered_users` (`did` PK)
- All indexes **without** `.using('btree')` (SQLite only supports B-tree; explicit clause may error)

No need to port `LEAST()`, regex `SUBSTRING`, `NOW()`, or `alterColumn` operations.

### 2.2 Schema Types (`src/db/schema.ts`)

SQLite returns `timestamp` columns as strings. Update:

```typescript
// Before
notifiedAt: GeneratedAlways<Date>;

// After
notifiedAt: GeneratedAlways<string>;
```

---

## Phase 3: Application Code SQL Rewrites

### 3.1 `DISTINCT ON` → `ROW_NUMBER()`

SQLite does not support `DISTINCT ON`. Use `ROW_NUMBER()` window functions.

**`src/algos.ts` — `firstHebrewPostsFeed`:**

Replace:
```typescript
.with('first_posts', (eb) =>
  eb
    .selectFrom('post')
    .distinctOn('author')
    .select(['uri', 'effectiveTimestamp'])
    .where('language', 'in', LANGS_HEBREW)
    .where('post.replyTo', 'is', null)
    .orderBy('author')
    .orderBy('effectiveTimestamp', 'asc'),
)
.selectFrom('first_posts')
.selectAll()
.orderBy('effectiveTimestamp', 'desc')
.limit(params.limit);
```

With:
```typescript
.with('first_posts', (eb) =>
  eb
    .selectFrom('post')
    .select(['uri', 'effectiveTimestamp', 'author'])
    .select(sql<number>`ROW_NUMBER() OVER (PARTITION BY author ORDER BY effectiveTimestamp ASC)`.as('rn'))
    .where('language', 'in', LANGS_HEBREW)
    .where('post.replyTo', 'is', null),
)
.selectFrom('first_posts')
.selectAll()
.where('rn', '=', 1)
.orderBy('effectiveTimestamp', 'desc')
.limit(params.limit);
```

**`src/notify-bot.ts`:**
Apply the same `ROW_NUMBER()` pattern. Replace `.distinctOn('author')` and filter `rn = 1` in the outer query.

### 3.2 `EXCEPT` → Verify or Rewrite

SQLite supports `EXCEPT`. Kysely's `.except()` should compile correctly for SQLite. Test it.

If it fails, rewrite:
```typescript
// Instead of:
.except(alreadyNotifiedUsers)

// Use:
.where('author', 'not in', (qb) => qb.selectFrom('notified_users').select('did'))
```

### 3.3 `numUpdatedRows` Type (`src/util/subscription.ts`)

`pg` returns `bigint` (`0n`). `better-sqlite3` returns `number` (`0`). Update:

```typescript
// Before
if (result.numUpdatedRows === 0n) {

// After
if (Number(result.numUpdatedRows) === 0) {
```

### 3.4 `NOW()` in Application Logic

Replace any `sql\`NOW()\`` with `sql\`CURRENT_TIMESTAMP\``. Check `src/notify-bot.ts` and `src/subscription.ts`.

---

## Phase 4: Data Migration Script

Create `scripts/migrate-to-sqlite.ts`.

This script connects to **both** PostgreSQL and SQLite simultaneously:

1. Connect to PostgreSQL (source).
2. Connect to SQLite (target) using the final schema.
3. Stream tables in dependency order:
   - `sub_state`
   - `notified_users`
   - `filtered_users`
   - `post` (in batches of 1,000)

**Execution order:**
1. Stop the server (prevent new writes to PostgreSQL).
2. Run the migration script: `npx ts-node scripts/migrate-to-sqlite.ts`
3. Start the server with SQLite configuration.
4. Verify feeds, cursors, and bot state.
5. Archive PostgreSQL database.

---

## Phase 5: Testing Checklist

- [ ] Fresh install works: `rm data/feed.db && npm run dev` creates DB and runs init migration.
- [ ] Migration script transfers all `post`, `sub_state`, `notified_users`, `filtered_users` rows correctly.
- [ ] Feed endpoints return correct data: `hebrew-feed`, `hebrew-noobs`, `yiddish-all`, `hebrew-feed-all`.
- [ ] `firstHebrewPostsFeed` returns only one post per author (`ROW_NUMBER()` works).
- [ ] Notify bot identifies new unnotified users correctly.
- [ ] Firehose cursor upsert in `sub_state` works after restart.
- [ ] Blocklist updater (`filtered_users`) transactional delete+insert works.
- [ ] Health check passes.
- [ ] Prometheus DB metrics still record.

---

## Phase 6: Rollback Plan

1. Keep the PostgreSQL database **read-only** until SQLite is validated in production for 24–48 hours.
2. If rollback is needed:
   - Stop server.
   - Revert `src/db/index.ts` to `PostgresDialect`.
   - Restore `POSTGRES_CONNECTION_STRING` in config.
   - If new posts were indexed in SQLite, export them back to PostgreSQL using a reverse migration script.
   - Start server.

---

## Updated File Change Summary

| File | Change |
|------|--------|
| `package.json` | Remove `pg`, `@types/pg`; add `better-sqlite3` |
| `src/config.ts` | Replace PG env vars with `SQLITE_DATABASE_PATH` |
| `src/db/index.ts` | `SqliteDialect` + WAL pragma; remove pool logic |
| `src/db/migrations.ts` | Single squashed `001_init` migration with final schema |
| `src/db/schema.ts` | Change `notifiedAt` from `Date` to `string` |
| `src/algos.ts` | Rewrite `distinctOn('author')` → `ROW_NUMBER()` CTE |
| `src/notify-bot.ts` | Rewrite `distinctOn('author')` → `ROW_NUMBER()` CTE; verify `EXCEPT` |
| `src/util/subscription.ts` | Fix `numUpdatedRows` type check (`0n` → `0`) |
| `scripts/migrate-to-sqlite.ts` | **New** one-off PG → SQLite data migration script |
| `.env` | Replace `POSTGRES_CONNECTION_STRING` with `SQLITE_DATABASE_PATH` |
