import fs from 'fs';
import Database from 'better-sqlite3';
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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
    notifiedAt: Date;
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

  const sqlitePath = process.env.SQLITE_DATABASE_PATH || './data/feed.db';

  console.log('=== PostgreSQL to SQLite Migration ===');
  console.log(`Source: PostgreSQL`);
  console.log(`Target: ${sqlitePath}`);

  const pgDb = new Kysely<PgDatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: pgConnectionString,
        ssl: { rejectUnauthorized: false },
      }),
    }),
  });

  fs.mkdirSync(sqlitePath.split('/').slice(0, -1).join('/') || './data', { recursive: true });
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('journal_mode = WAL');

  const sqliteDb = new Kysely<SqliteDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  try {
    console.log('\n--- Migrating sub_state ---');
    const subStateRows = await pgDb.selectFrom('sub_state').selectAll().execute();
    console.log(`Found ${subStateRows.length} rows in sub_state`);
    for (const row of subStateRows) {
      await sqliteDb
        .insertInto('sub_state')
        .values({ service: row.service, cursor: row.cursor })
        .execute();
    }
    console.log('sub_state migration complete');

    console.log('\n--- Migrating notified_users ---');
    const notifiedRows = await pgDb.selectFrom('notified_users').selectAll().execute();
    console.log(`Found ${notifiedRows.length} rows in notified_users`);
    for (const row of notifiedRows) {
      await sqliteDb
        .insertInto('notified_users')
        .values({ did: row.did, notifiedAt: row.notifiedAt.toISOString() })
        .execute();
    }
    console.log('notified_users migration complete');

    console.log('\n--- Migrating filtered_users ---');
    const filteredRows = await pgDb.selectFrom('filtered_users').selectAll().execute();
    console.log(`Found ${filteredRows.length} rows in filtered_users`);
    for (const row of filteredRows) {
      await sqliteDb
        .insertInto('filtered_users')
        .values({ did: row.did })
        .execute();
    }
    console.log('filtered_users migration complete');

    console.log('\n--- Migrating posts ---');
    const totalCount = await pgDb
      .selectFrom('post')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    console.log(`Total posts to migrate: ${totalCount.count}`);

    const batchSize = 1000;
    let offset = 0;
    let migratedCount = 0;

    while (true) {
      const batch = await pgDb
        .selectFrom('post')
        .selectAll()
        .limit(batchSize)
        .offset(offset)
        .execute();

      if (batch.length === 0) break;

      for (const post of batch) {
        await sqliteDb
          .insertInto('post')
          .values({
            uri: post.uri,
            author: post.author,
            cid: post.cid,
            indexedAt: post.indexedAt,
            createdAt: post.createdAt,
            effectiveTimestamp: post.effectiveTimestamp,
            replyRoot: post.replyRoot,
            replyTo: post.replyTo,
            language: post.language,
          })
          .execute();
      }

      offset += batchSize;
      migratedCount += batch.length;
      console.log(`Migrated ${migratedCount}/${totalCount.count} posts...`);
    }
    console.log('posts migration complete');

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

main();
