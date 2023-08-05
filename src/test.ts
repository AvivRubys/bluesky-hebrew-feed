import SqliteDb from 'better-sqlite3';
import path from 'path';
import fasttext from 'fasttext';
import fs from 'fs';
import { extractTextLanguage } from './util/hebrew';
import { BskyAgent } from '@atproto/api';

interface Post {
  repo: string;
  rkey: string;
}

const fasttextCompressed = new fasttext.Classifier(
  path.join(__dirname, '..', 'lid.176.ftz'),
);

async function extractFasttextCompressed(text: string) {
  const resp = await fasttextCompressed.predict(text, 7);
  return resp.length > 0 ? resp[0].label.replace('__label__', '') : '';
}

const fasttextFull = new fasttext.Classifier(
  path.join(__dirname, '..', 'lid.176.bin'),
);

async function extractFasttextFull(text: string) {
  const resp = await fasttextFull.predict(text, 7);
  return resp.length > 0 ? resp[0].label.replace('__label__', '') : '';
}

const extractExistingModelLanguage = extractTextLanguage;

const api = new BskyAgent({ service: 'https://bsky.social/' });
const db = new SqliteDb('./results.db');
const posts = JSON.parse(fs.readFileSync('./posts.json').toString()) as Post[];

(async () => {
  db.exec(
    'CREATE TABLE posts (repo TEXT, rkey TEXT, text TEXT, fasttext_full TEXT, fasttext_compressed TEXT, cld TEXT, bsky TEXT);',
  );

  for (const post of posts) {
    try {
      const resp = await api.getPost(post);
      const [fttCompressed, ftt, cld] = await Promise.all([
        extractFasttextCompressed(resp.value.text),
        extractFasttextFull(resp.value.text),
        extractExistingModelLanguage(resp.value.text),
      ]);

      const insert = db.prepare(
        'INSERT INTO posts (repo, rkey, text, fasttext_full, fasttext_compressed, cld, bsky) VALUES (?, ?, ?, ?, ?, ?, ?);',
      );

      insert.run(
        post.repo,
        post.rkey,
        resp.value.text,
        ftt,
        fttCompressed,
        cld,
        resp.value.langs?.join(','),
      );
    } catch (err) {
      console.error(
        'Error in repo=',
        post.repo,
        ' rkey=',
        post.rkey,
        '. Error=',
        err,
      );
    }
  }
})();
