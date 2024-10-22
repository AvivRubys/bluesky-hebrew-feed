import { Kysely, MigrationProvider, sql } from 'kysely';

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '001': createTables,
      '002': addReplyColumns,
      '003': addLanguageColumn,
      '004': addAuthorColumn,
      '005': addIndexOnIndexedAtAndLanguage,
      '006': addIndexOnAuthor,
      '007': optimizeIndexes,
      '008': removeLanguageDefault,
      '009': createNotifiedUsersTable,
      '010': cursorToString,
      '011': addCreatedAtToPost,
      '012': addEffectiveTimestampToPost,
      '013': optimizeIndexes2,
      '014': addRecommendedIndexes,
    };
  },
};

const createTables = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute();
  },
};

const addReplyColumns = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('replyRoot', 'varchar')
      .addColumn('replyTo', 'varchar')
      .execute();
  },
};

const addLanguageColumn = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('language', 'varchar', (col) => col.notNull().defaultTo('iw'))
      .execute();
  },
};

const addAuthorColumn = {
  async up(db: Kysely<any>) {
    await db.schema.alterTable('post').addColumn('author', 'varchar').execute();

    await db
      .updateTable('post')
      .set({
        author: sql<string>`SUBSTRING("uri", 'at://(.*)/app.bsky.feed.post/.*')`,
      })
      .execute();

    await db.schema
      .alterTable('post')
      .alterColumn('author', (col) => col.setNotNull())
      .execute();
  },
};

const addIndexOnIndexedAtAndLanguage = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createIndex('post_indexedat_language_author_index')
      .on('post')
      .columns(['indexedAt', 'language'])
      .execute();
  },
};

const addIndexOnAuthor = {
  async up(db: Kysely<unknown>) {
    // To allow filtering by user, mainly for blocklist consideration feature
    await db.schema
      .createIndex('post_author_index')
      .on('post')
      .column('author')
      .execute();
  },
};

const optimizeIndexes = {
  async up(db: Kysely<unknown>) {
    // Feeds are effectively partitioned by language and on being posts or replies
    await db.schema
      .createIndex('post_language_replyto_index')
      .on('post')
      .columns(['language', 'replyTo'])
      .using('btree')
      .execute();

    // Cursors use indexedAt heavily, as well as ordering any feed query
    await db.schema
      .createIndex('post_indexedat_index')
      .on('post')
      .column('indexedAt')
      .using('btree')
      .execute();

    // Should not be needed anymore
    await db.schema.dropIndex('post_indexedat_language_author_index').execute();
  },
};

const removeLanguageDefault = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .alterColumn('language', (c) => c.dropDefault())
      .execute();
  },
};

const createNotifiedUsersTable = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('notified_users')
      .addColumn('did', 'varchar', (c) => c.primaryKey())
      .addColumn('notifiedAt', 'timestamp', (c) => c.defaultTo(sql`NOW()`))
      .execute();
  },
};

const cursorToString = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('sub_state')
      .alterColumn('cursor', (c) => c.setDataType('varchar'))
      .execute();
  },
};

const addCreatedAtToPost = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('createdAt', 'varchar')
      .execute();
  },
};

const addEffectiveTimestampToPost = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('post')
      .addColumn('effectiveTimestamp', 'varchar')
      .execute();

    await db
      .updateTable('post')
      .set({
        effectiveTimestamp: sql<string>`LEAST("indexedAt", "createdAt")`,
      })
      .execute();

    await db.schema
      .alterTable('post')
      .alterColumn('effectiveTimestamp', (c) => c.setNotNull())
      .execute();
  },
};

const optimizeIndexes2 = {
  async up(db: Kysely<unknown>) {
    // Should not be needed anymore
    await db.schema.dropIndex('post_indexedat_index').execute();

    await db.schema
      .createIndex('post_effectivetimestamp_index')
      .on('post')
      .column('effectiveTimestamp')
      .using('btree')
      .execute();
  },
};

const addRecommendedIndexes = {
  async up(db: Kysely<unknown>) {
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
      .using('btree')
      .execute();

    await db.schema
      .createIndex('language_feed_block_subquery_index')
      .on('post')
      .columns(['author', 'uri'])
      .using('btree')
      .execute();
  },
};
