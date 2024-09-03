import { parentPort, workerData } from 'worker_threads';
import { extractTextLanguage } from './util/hebrew';
import { RichText } from '@atproto/api';
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post';

function createPost(create: {
  record: PostRecord;
  uri: any;
  author: any;
  cid: any;
}) {
  const language = extractTextLanguage(removeFacets(create.record));

  return {
    uri: create.uri,
    author: create.author,
    cid: create.cid,
    replyTo: create.record.reply?.parent.uri,
    replyRoot: create.record.reply?.root.uri,
    indexedAt: new Date().toISOString(),
    language,
  };
}

const result = createPost(workerData);

parentPort?.postMessage(result);

function removeFacets(record: PostRecord) {
  const richText = new RichText({
    text: record.text,
    facets: record.facets,
    entities: record.entities,
  });

  for (const facet of richText.facets ?? []) {
    richText.delete(facet.index.byteStart, facet.index.byteEnd);
  }

  return richText.text.trim();
}
