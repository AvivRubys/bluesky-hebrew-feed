import { Kysely, MigrationProvider, sql } from 'kysely';

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '006_add_language_timestamp_index': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .createIndex('post_language_timestamp_index')
            .on('post')
            .columns(['language', 'timestamp desc'])
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema
            .dropIndex('post_language_timestamp_index')
            .ifExists()
            .execute();
        },
      },
      '007_optimize_feed_indexes': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .createIndex('post_lang_author_timestamp_idx')
            .on('post')
            .columns(['language', 'author', 'timestamp'])
            .execute();

          await db.schema
            .createIndex('post_lang_author_ts_no_reply_idx')
            .on('post')
            .columns(['language', 'author', 'timestamp'])
            .where(sql.ref('replyTo'), 'is', null)
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema.dropIndex('post_lang_author_timestamp_idx').ifExists().execute();
          await db.schema.dropIndex('post_lang_author_ts_no_reply_idx').ifExists().execute();
        },
      },
      '005_drop_reply_root': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .alterTable('post')
            .dropColumn('replyRoot')
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema
            .alterTable('post')
            .addColumn('replyRoot', 'varchar')
            .execute();
        },
      },
      '004_rename_effective_timestamp': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .alterTable('post')
            .renameColumn('effectiveTimestamp', 'timestamp')
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema
            .alterTable('post')
            .renameColumn('timestamp', 'effectiveTimestamp')
            .execute();
        },
      },
      '003_drop_redundant_timestamps': {
        async up(db: Kysely<unknown>) {
          await sql`UPDATE post SET effectiveTimestamp = MIN(indexedAt, COALESCE(createdAt, indexedAt)) WHERE effectiveTimestamp != MIN(indexedAt, COALESCE(createdAt, indexedAt))`.execute(db);

          await db.schema
            .alterTable('post')
            .dropColumn('indexedAt')
            .execute();

          await db.schema
            .alterTable('post')
            .dropColumn('createdAt')
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema
            .alterTable('post')
            .addColumn('createdAt', 'varchar')
            .execute();

          await db.schema
            .alterTable('post')
            .addColumn('indexedAt', 'varchar')
            .execute();
        },
      },
      '002_optimize_indexes_remove_cid': {
        async up(db: Kysely<unknown>) {
          await db.schema
            .dropIndex('post_effectivetimestamp_index')
            .ifExists()
            .execute();

          await db.schema
            .dropIndex('post_language_replyto_index')
            .ifExists()
            .execute();

          await db.schema
            .dropIndex('language_feed_index')
            .ifExists()
            .execute();

          await db.schema
            .alterTable('post')
            .dropColumn('cid')
            .execute();

          await db.schema
            .createIndex('post_language_replyto_index')
            .on('post')
            .columns(['language', 'replyTo', 'effectiveTimestamp desc'])
            .execute();

          await db.schema
            .createIndex('language_feed_index')
            .on('post')
            .columns([
              'language',
              'author',
              'replyTo',
              'effectiveTimestamp desc',
            ])
            .execute();
        },
        async down(db: Kysely<unknown>) {
          await db.schema
            .dropIndex('post_language_replyto_index')
            .ifExists()
            .execute();

          await db.schema
            .dropIndex('language_feed_index')
            .ifExists()
            .execute();

          await db.schema
            .alterTable('post')
            .addColumn('cid', 'varchar')
            .execute();

          await db.schema
            .createIndex('post_language_replyto_index')
            .on('post')
            .columns(['language', 'replyTo'])
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
        },
      },
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
      '009_sqlite_optimize': {
        async up(db: Kysely<unknown>) {
          await db.schema.dropIndex('language_feed_index').ifExists().execute();
          await db.schema.dropIndex('post_language_replyto_index').ifExists().execute();
          await db.schema.dropIndex('post_effectivetimestamp_index').ifExists().execute();

          await db.schema
            .createIndex('post_feed_covering_idx')
            .on('post')
            .columns(['language', 'timestamp desc', 'uri'])
            .execute();

          await db.schema
            .createIndex('post_first_post_idx')
            .on('post')
            .columns(['language', 'author', 'timestamp'])
            .where(sql.ref('replyTo'), 'is', null)
            .execute();

          await sql`ANALYZE`.execute(db);
        },
        async down(db: Kysely<unknown>) {
          await db.schema.dropIndex('post_feed_covering_idx').ifExists().execute();
          await db.schema.dropIndex('post_first_post_idx').ifExists().execute();

          await db.schema
            .createIndex('post_effectivetimestamp_index')
            .on('post')
            .column('timestamp')
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('post_language_replyto_index')
            .on('post')
            .columns(['language', 'replyTo'])
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('language_feed_index')
            .on('post')
            .columns(['language', 'author', 'replyTo', 'timestamp desc'])
            .ifNotExists()
            .execute();

          await sql`ANALYZE`.execute(db);
        },
      },
      '008_restore_postgres_indexes': {
        async up(db: Kysely<unknown>) {
          await db.schema.dropIndex('language_feed_block_subquery_index').ifExists().execute()
          await db.schema.dropIndex('language_feed_index').ifExists().execute()
          await db.schema.dropIndex('post_author_index').ifExists().execute()
          await db.schema.dropIndex('post_lang_author_timestamp_idx').ifExists().execute()
          await db.schema.dropIndex('post_lang_author_ts_no_reply_idx').ifExists().execute()
          await db.schema.dropIndex('post_language_replyto_index').ifExists().execute()

          await db.schema
            .createIndex('language_feed_index')
            .on('post')
            .columns([
              'language',
              'author',
              'replyTo',
              'timestamp desc',
            ])
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('language_feed_block_subquery_index')
            .on('post')
            .columns(['author', 'uri'])
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('post_effectivetimestamp_index')
            .on('post')
            .column('timestamp')
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('post_language_replyto_index')
            .on('post')
            .columns(['language', 'replyTo'])
            .ifNotExists()
            .execute();

          await db.schema
            .createIndex('post_author_index')
            .on('post')
            .column('author')
            .ifNotExists()
            .execute();
        },
      },
    };
  },
};
