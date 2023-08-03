export type DatabaseSchema = {
  post: PostSchema;
  sub_state: SubStateSchema;
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
