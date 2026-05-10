import fs from 'fs';
import Database from 'better-sqlite3';
import { Kysely, MigrationProvider, Migrator, PostgresDialect, sql, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

interface PgDatabaseSchema {
  post: {
    uri: string;
    author: string;
    cid: string;
    indexedAt: string;
    createdAt: string | null;
    effectiveTimestamp: string;
    replyRoot: string | null;
    replyTo: string | null;
    language: string;
  };
  sub_state: {
    service: string;
    cursor: string;
  };
  notified_users: {
    did: string;
    notifiedAt: Date | string;
  };
  filtered_users: {
    did: string;
  };
}

interface SqliteDatabaseSchema {
  post: {
    uri: string;
    author: string;
    cid: string;
    indexedAt: string;
    createdAt: string | null;
    effectiveTimestamp: string;
    replyRoot: string | null;
    replyTo: string | null;
    language: string;
  };
  sub_state: {
    service: string;
    cursor: string;
  };
  notified_users: {
    did: string;
    notifiedAt: string;
  };
  filtered_users: {
    did: string;
  };
}

async function main() {
  const pgConnectionString = process.env.POSTGRES_CONNECTION_STRING;
  if (!pgConnectionString) {
    console.error('Error: POSTGRES_CONNECTION_STRING environment variable is required');
    console.error('Usage: POSTGRES_CONNECTION_STRING=postgresql://... npx ts-node scripts/migrate-to-sqlite.ts');
    process.exit(1);
  }

  const sqlitePath = process.env.SQLITE_DATABASE_PATH || 'feed.db';

  console.log('=== PostgreSQL to SQLite Migration ===');
  console.log(`Source: PostgreSQL`);
  console.log(`Target: ${sqlitePath}`);

  const pgDb = new Kysely<PgDatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: pgConnectionString,
        ssl: {
          rejectUnauthorized: true,
          ca: fs.readFileSync(pgCertFilepath),
        }
      }),
    }),
  });

  const sqlite = new Database(sqlitePath);
  sqlite.pragma('journal_mode = OFF');
  sqlite.pragma('synchronous = OFF');
  sqlite.pragma('foreign_keys = OFF');
  sqlite.pragma('cache_size = -64000');

  const sqliteDb = new Kysely<SqliteDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  
    const migrator = new Migrator({ db: sqliteDb, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    console.error(error)
    return
  }

  try {
    console.log('\n--- Migrating sub_state ---');
    const subStateRows = await pgDb.selectFrom('sub_state').selectAll().execute();
    console.log(`Found ${subStateRows.length} rows in sub_state`);
    if (subStateRows.length > 0) {
      await sqliteDb.transaction().execute(async (trx) => {
        await trx
        .insertInto('sub_state')
          .values(subStateRows.map((row) => ({ service: row.service, cursor: row.cursor })))
          .onConflict((oc) => oc.doNothing())
        .execute();
      });
    }
    console.log('sub_state migration complete');

    console.log('\n--- Migrating notified_users ---');
    const notifiedRows = await pgDb.selectFrom('notified_users').selectAll().execute();
    console.log(`Found ${notifiedRows.length} rows in notified_users`);
    if (notifiedRows.length > 0) {
      await sqliteDb.transaction().execute(async (trx) => {
        await trx
        .insertInto('notified_users')
          .values(
            notifiedRows.map((row) => ({
              did: row.did,
              notifiedAt: row.notifiedAt instanceof Date ? row.notifiedAt.toISOString() : String(row.notifiedAt),
            })),
          )
          .onConflict((oc) => oc.doNothing())
        .execute();
      });
    }
    console.log('notified_users migration complete');

    console.log('\n--- Migrating filtered_users ---');
    const filteredRows = await pgDb.selectFrom('filtered_users').selectAll().execute();
    console.log(`Found ${filteredRows.length} rows in filtered_users`);
    if (filteredRows.length > 0) {
      await sqliteDb.transaction().execute(async (trx) => {
        await trx
        .insertInto('filtered_users')
          .values(filteredRows.map((row) => ({ did: row.did })))
          .onConflict((oc) => oc.doNothing())
        .execute();
      });
    }
    console.log('filtered_users migration complete');

    console.log('\n--- Migrating posts ---');
    const totalCount = await pgDb
      .selectFrom('post')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    console.log(`Total posts to migrate: ${totalCount.count}`);

    const batchSize = 10000;
    const insertChunkSize = Math.floor(999 / 9);
    let migratedCount = 0;
    let lastUri = '';

    while (true) {
      let query = pgDb
        .selectFrom('post')
        .selectAll()
        .orderBy('uri')
        .limit(batchSize);
      if (lastUri) {
        query = query.where('uri', '>', lastUri);
      }
      const batch = await query.execute();

      if (batch.length === 0) break;

      await sqliteDb.transaction().execute(async (trx) => {
        for (const c of chunk(batch, insertChunkSize)) {
          await trx
          .insertInto('post')
            .values(
              c.map((post) => ({
            uri: post.uri,
            author: post.author,
            cid: post.cid,
            indexedAt: post.indexedAt,
            createdAt: post.createdAt,
            effectiveTimestamp: post.effectiveTimestamp,
            replyRoot: post.replyRoot,
            replyTo: post.replyTo,
            language: post.language,
              })),
            )
            .onConflict((oc) => oc.doNothing())
          .execute();
      }
      });

      lastUri = batch[batch.length - 1].uri;
      migratedCount += batch.length;
      console.log(`Migrated ${migratedCount}/${totalCount.count} posts...`);
    }
    console.log('posts migration complete');

    console.log('\n--- Creating indexes ---');
    await sqliteDb.schema
      .createIndex('post_language_replyto_index')
      .on('post')
      .columns(['language', 'replyTo'])
      .execute();
    await sqliteDb.schema
      .createIndex('post_author_index')
      .on('post')
      .column('author')
      .execute();
    await sqliteDb.schema
      .createIndex('post_effectivetimestamp_index')
      .on('post')
      .column('effectiveTimestamp')
      .execute();
    await sqliteDb.schema
      .createIndex('language_feed_index')
      .on('post')
      .columns([
        'language',
        'author',
        'replyTo',
        'effectiveTimestamp desc',
        'cid desc',
      ])
      .execute();
    await sqliteDb.schema
      .createIndex('language_feed_block_subquery_index')
      .on('post')
      .columns(['author', 'uri'])
      .execute();
    console.log('indexes created');

    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('foreign_keys = ON');
    console.log('SQLite pragmas restored');

    console.log('\n=== Migration Summary ===');
    console.log(`sub_state: ${subStateRows.length} rows`);
    console.log(`notified_users: ${notifiedRows.length} rows`);
    console.log(`filtered_users: ${filteredRows.length} rows`);
    console.log(`posts: ${migratedCount} rows`);
    console.log('\nMigration completed successfully!');

    console.log('\nNext steps:');
    console.log('1. Verify the SQLite database: sqlite3 data/feed.db ".tables"');
    console.log('2. Start the server with SQLite configuration');
    console.log('3. Verify feeds, cursors, and bot state');
    console.log('4. Archive PostgreSQL database');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pgDb.destroy();
    await sqliteDb.destroy();
    sqlite.close();
  }
}

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '001_init': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .createTable('post')
            .addColumn('uri', 'varchar', (col) => col.primaryKey())
            .addColumn('author', 'varchar', (col) => col.notNull())
            .addColumn('cid', 'varchar', (col) => col.notNull())
            .addColumn('indexedAt', 'varchar', (col) => col.notNull())
            .addColumn('createdAt', 'varchar')
            .addColumn('effectiveTimestamp', 'varchar', (col) => col.notNull())
            .addColumn('replyRoot', 'varchar')
            .addColumn('replyTo', 'varchar')
            .addColumn('language', 'varchar', (col) => col.notNull())
            .execute();

          await db.schema
            .createTable('sub_state')
            .addColumn('service', 'varchar', (col) => col.primaryKey())
            .addColumn('cursor', 'varchar', (col) => col.notNull())
            .execute();

          await db.schema
            .createTable('notified_users')
            .addColumn('did', 'varchar', (col) => col.primaryKey())
            .addColumn('notifiedAt', 'varchar', (col) =>
              col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute();

          await db.schema
            .createTable('filtered_users')
            .addColumn('did', 'varchar', (col) => col.notNull().primaryKey())
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema.dropTable('filtered_users').ifExists().execute();
          await db.schema.dropTable('notified_users').ifExists().execute();
          await db.schema.dropTable('sub_state').ifExists().execute();
          await db.schema.dropTable('post').ifExists().execute();
        },
      },
    };
  },
};

main();