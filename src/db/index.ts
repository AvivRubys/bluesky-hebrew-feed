import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, LogEvent, Migrator, sql } from 'kysely';
import { Histogram } from 'prom-client';
import { DatabaseSchema } from './schema';
import { migrationProvider } from './migrations';
import { Config } from '../config';
import { createMonitoringPlugin } from '../util/monitoring';

const database_operation_duration = new Histogram({
  name: 'database_operation_duration',
  help: 'Duration of all database operations',
  labelNames: ['operation_type'],
});

export async function createDb(cfg: Config): Promise<Database> {
  const db = new Kysely<DatabaseSchema>({
    dialect: new LibsqlDialect({ url: 'file:' + cfg.SQLITE_DATABASE_PATH }),
    plugins: [createMonitoringPlugin(database_operation_duration)],
    log(event: LogEvent) {
      if (event.level === 'error') return
      if (event.query.query.kind === 'SelectQueryNode') {
        console.log(`query: ${event.query.sql}`)
        console.log(`query parameters: ${event.query.parameters}`)
        console.log(`query duration: ${event.queryDurationMillis.toFixed(1)}ms`)
        console.log()
      }
    }
  });

  await sql`PRAGMA journal_mode = WAL`.execute(db);
  await sql`PRAGMA synchronous = NORMAL`.execute(db);
  await sql`PRAGMA busy_timeout = 5000`.execute(db);
  await sql`PRAGMA cache_size = -64000`.execute(db);

  return db;
}

export async function migrateToLatest(db: Database) {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

export type Database = Kysely<DatabaseSchema>;
