import { GeneratedAlways } from 'kysely';

export type DatabaseSchema = {
  post: PostSchema;
  sub_state: SubStateSchema;
  block_cache: BlockCacheSchema;
};

export type PostSchema = {
  uri: string;
  author: string;
  cid: string;
  indexedAt: string;
  replyRoot?: string;
  replyTo?: string;
  language: string;
};

export type SubStateSchema = {
  service: string;
  cursor: number;
};

export type BlockCacheSchema = {
  did: string;
  blockedDids: string[];
  createdAt: GeneratedAlways<Date>;
};
