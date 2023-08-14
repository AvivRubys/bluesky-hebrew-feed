import { Kysely, MigrationProvider, sql } from 'kysely';
import { DatabaseSchema } from './schema';

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
      '009': createAuthorLanguageView,
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

const createAuthorLanguageView = {
  async up(db: Kysely<DatabaseSchema>) {
    await db.schema
      .createView('author_language')
      .materialized()
      .as(
        sql`
SELECT
  author,
  CASE 
    WHEN COUNT(*) <= 10 THEN NULL
    WHEN 1.0 * COUNT(*) FILTER (WHERE language IN ('he', 'iw')) / COUNT(*) > 0.6 THEN 'he'
    WHEN 1.0 * COUNT(*) FILTER (WHERE language = 'yi') / COUNT(*) > 0.6 THEN 'yi'
    ELSE NULL
  END AS "language"
FROM post
GROUP BY author;
      `,
      )
      .execute();
  },
};
