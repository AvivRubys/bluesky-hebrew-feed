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
    await db.schema
      .createIndex('post_author_index')
      .on('post')
      .column('author')
      .execute();
  },
};
