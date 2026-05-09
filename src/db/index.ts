import Database from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect } from 'kysely';
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

export function createDb(cfg: Config): Database {
  const sqlite = new Database(cfg.SQLITE_DATABASE_PATH);
  sqlite.pragma('journal_mode = WAL');

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [createMonitoringPlugin(database_operation_duration)],
  });
}

export async function migrateToLatest(db: Database) {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

export type Database = Kysely<DatabaseSchema>;
