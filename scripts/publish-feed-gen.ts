import 'dotenv/config';
import { AtpAgent, BlobRef } from '@atproto/api';
import fs from 'fs/promises';
import { ids } from '../src/lexicon/lexicons';
import path from 'path';

const suffix = '\nהפיד בקוד פתוח! מוזמנים לעקוב ולעזור.';

const feeds = [
  {
    recordName: 'hebrew-noobs',
    displayName: 'עברית חדשים',
    description: 'כל הפוסטים הראשונים בעברית' + suffix,
    avatar: path.join(__dirname, 'feed-avatars', 'ח.png'),
  },
  {
    recordName: 'hebrew-feed',
    displayName: 'עברית',
    description: 'כל הפוסטים בעברית (ללא תגובות).' + suffix,
    avatar: path.join(__dirname, 'feed-avatars', 'א.png'),
  },
  {
    recordName: 'hebrew-feed-all',
    displayName: 'עברית + תגובות',
    description: 'כל הפוסטים והתגובות בעברית.' + suffix,
    avatar: path.join(__dirname, 'feed-avatars', 'ת.png'),
  },
  {
    recordName: 'hebrew-milifney',
    displayName: 'עברית לפני שנה',
    description: 'כל הפוסטים והתגובות בעברית מלפני בדיוק שנה.' + suffix,
    avatar: path.join(__dirname, 'feed-avatars', 'ז.png'),
  },
  {
    recordName: 'yiddish-all',
    displayName: 'יידיש',
    description:
      "All posts and replies in yiddish.\nThis feed is open source, you're welcome to help!",
    avatar: path.join(__dirname, 'feed-avatars', 'ע.png'),
  },

];

const handle = 'avivr.dev';
const password = 'hghh-4pzy-j43w-7z5q';

(async () => {
  for (const feed of feeds) {
    console.log('Running', feed.recordName);

    await createFeed(
      feed.recordName,
      feed.displayName,
      feed.description,
      feed.avatar,
    );

    console.log('All done 🎉');
    console.log();
  }
})();

async function createFeed(
  recordName: string,
  displayName: string,
  description: string,
  avatar: string,
) {
  // -------------------------------------
  // NO NEED TO TOUCH ANYTHING BELOW HERE
  // -------------------------------------

  if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
    throw new Error('Please provide a hostname in the .env file');
  }
  const feedGenDid =
    process.env.FEEDGEN_SERVICE_DID ??
    `did:web:${process.env.FEEDGEN_HOSTNAME}`;

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });

  let avatarRef: BlobRef | undefined;
  if (avatar) {
    let encoding: string;
    if (avatar.endsWith('png')) {
      encoding = 'image/png';
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg';
    } else {
      throw new Error('expected png or jpeg');
    }
    const img = await fs.readFile(avatar);
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    });
    if (!blobRes.success) {
      throw new Error(
        'Failed uploading blob' + JSON.stringify(blobRes, null, 4),
      );
    }
    avatarRef = blobRes.data.blob;
  }

  const putResp = await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
    },
  });

  if (!putResp.success) {
    throw new Error(
      'Failed setting feed record' + JSON.stringify(putResp, null, 4),
    );
  }
}
