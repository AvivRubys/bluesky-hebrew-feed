import { AtUri } from '@atproto/syntax';
import { BskyAgent } from '@atproto/api';
import { createDb } from '../src/db';

async function create() {
  const agent = new BskyAgent({
    service: 'https://bsky.social',
  });

  await agent.login({
    identifier: 'USERNAME',
    password: 'APP PASSWORD',
  });

  return agent;
}

async function getPost(api: BskyAgent, uri: AtUri) {
  try {
    return await api.getPost({
      repo: uri.host,
      rkey: uri.rkey,
    });
  } catch (err) {
    console.error('Failed to fetch post', uri);
    console.error(err);
    console.error();

    return null;
  }
}

(async () => {
  const db = createDb('CONNECTION_STRING');
  const api = await create();
  const posts = await db
    .selectFrom('post')
    .select(['uri'])
    .orderBy('indexedAt', 'desc')
    .execute();

  for (const { uri, i } of posts.map((p, i) => ({ uri: p.uri, i: i }))) {
    const fullPost = await getPost(api, new AtUri(uri));

    if (!fullPost?.value.reply) {
      console.log(i, 'Skipping', uri);
      continue;
    }

    await db
      .updateTable('post')
      .set({
        replyTo: fullPost.value.reply?.parent.uri,
        replyRoot: fullPost.value.reply?.root.uri,
      })
      .where('uri', '=', uri)
      .executeTakeFirstOrThrow();

    console.log(i, 'Updated', uri);
  }
})();
