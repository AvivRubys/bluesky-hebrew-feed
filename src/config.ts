import { z } from 'zod';
import { Database } from './db';
import { BlockService } from './blocks';

export type AppContext = {
  db: Database;
  cfg: Config;
  block: BlockService;
};

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('localhost'),
  POSTGRES_CONNECTION_STRING: z.string(),
  FEEDGEN_SUBSCRIPTION_ENDPOINT: z.string().default('wss://bsky.social'),
  FEEDGEN_HOSTNAME: z.string().default('example.com'),
  FEEDGEN_PUBLISHER_DID: z.string(),
  SUBSCRIPTION_RECONNECT_DELAY: z.number().default(3000),
});

export function parseEnvironment() {
  return envSchema.parse(process.env);
}

export type Config = z.infer<typeof envSchema>;
