import { z } from 'zod'
import { DidResolver } from '@atproto/did-resolver'
import { Database } from './db'

export type AppContext = {
  db: Database
  didResolver: DidResolver
  cfg: Config
}

const envSchema = z.object({
  FEEDGEN_PORT: z.number().default(3000),
  FEEDGEN_LISTENHOST: z.string().default('localhost'),
  FEEDGEN_SQLITE_LOCATION: z.string().default(':memory:'),
  FEEDGEN_SUBSCRIPTION_ENDPOINT: z.string().default('wss://bsky.social'),
  FEEDGEN_HOSTNAME: z.string().default('example.com'),
  FEEDGEN_PUBLISHER_DID: z.string(),
  FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY: z.number().default(3000),
})

export function parseEnvironment() {
  return envSchema.parse(process.env)
}

export type Config = z.infer<typeof envSchema>
