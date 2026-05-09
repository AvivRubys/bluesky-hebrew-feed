import { Kysely, MigrationProvider, sql } from 'kysely';

export const migrationProvider: MigrationProvider = {
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

          await db.schema
            .createIndex('post_language_replyto_index')
            .on('post')
            .columns(['language', 'replyTo'])
            .execute();

          await db.schema
            .createIndex('post_author_index')
            .on('post')
            .column('author')
            .execute();

          await db.schema
            .createIndex('post_effectivetimestamp_index')
            .on('post')
            .column('effectiveTimestamp')
            .execute();

          await db.schema
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

          await db.schema
            .createIndex('language_feed_block_subquery_index')
            .on('post')
            .columns(['author', 'uri'])
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
