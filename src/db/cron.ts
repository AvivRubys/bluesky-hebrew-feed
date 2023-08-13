import { sql } from 'kysely';
import { Database } from '.';
import { interval } from 'ix/asynciterable';

export async function refreshAuthorLanguage(
  db: Database,
  refreshIntervalMs: number,
) {
  for await (const _ of interval(refreshIntervalMs)) {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY author_language;`.execute(
      db,
    );
  }
}
