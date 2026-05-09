import { subMilliseconds } from 'date-fns';
import { interval } from 'ix/asynciterable';
import { sql } from 'kysely';
import { AppContext } from './context';
import { LANGS_HEBREW } from './util/hebrew';
import logger from './logger';
import { RichText } from '@atproto/api';

export async function runNotifyBot(ctx: AppContext) {
  for await (const _ of interval(ctx.cfg.BOT_RUN_INTERVAL_MS)) {
    try {
      await notifyNewPosters(ctx);
    } catch (err: unknown) {
      logger.error({ err }, 'Notify bot iteration failed');
    }
  }
}

async function notifyNewPosters(ctx: AppContext) {
  const startDate = subMilliseconds(
    new Date(),
    ctx.cfg.BOT_LOOKBACK_INTERVAL_MS,
  );

  const newUsers = ctx.db
    .with('first_posts', (eb) =>
      eb
        .selectFrom('post')
        .select(['author', 'indexedAt'])
        .select(
          sql<number>`ROW_NUMBER() OVER (PARTITION BY author ORDER BY indexedAt ASC)`.as(
            'rn',
          ),
        )
        .where('language', 'in', LANGS_HEBREW)
        .where('replyTo', 'is', null),
    )
    .selectFrom('first_posts')
    .select('author')
    .where('rn', '=', 1)
    .where('indexedAt', '>', startDate.toISOString())
    .as('new_users');

  const newUnnotifiedUsers = await ctx.db
    .selectFrom(newUsers)
    .select('author')
    .where('author', 'not in', (qb) =>
      qb.selectFrom('notified_users').select('did'),
    )
    .execute();

  for (const row of newUnnotifiedUsers) {
    const resolvedHandle = await ctx.bsky.getProfile({ actor: row.author });
    const rt = new RichText({
      text: `היי @${resolvedHandle.data.handle}, נראה שפרסמת את הפוסט הראשון שלך בעברית!\nחסר לך אחרי מי לעקוב? לא יודע/ת איפה כולם? נסה/י את פיד עברית!`,
    });
    await rt.detectFacets(ctx.bsky);

    await ctx.bsky.post({
      text: rt.text,
      facets: rt.facets,
      langs: ['he', 'yi', 'iw'],
      embed: {
        $type: 'app.bsky.embed.record',
        record: {
          cid: 'bafyreihhxa4ukspeaudjufw6ydzp3h3atlbfzjkfloguvsx76r6zc2q5p4',
          uri: 'at://did:plc:ioo5uzicjxs5i6nfpjcxbugg/app.bsky.feed.post/3k5kjdysvef25',
        },
      },
    });

    await ctx.db
      .insertInto('notified_users')
      .values({ did: row.author })
      .executeTakeFirst();
  }

  console.log();
}
