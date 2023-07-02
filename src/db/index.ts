import SqliteDb from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect } from 'kysely';
import { DatabaseSchema } from './schema';
import { migrationProvider } from './migrations';

export const createDb = (location: string): Database => {
  const database = new SqliteDb(location);
  database.pragma('journal_mode = WAL');

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database,
    }),
  });
};

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
};

export type Database = Kysely<DatabaseSchema>;
