import 'dotenv/config'
import FeedGenerator from './server'
import { parseEnvironment } from './config'

async function run() {
  const server = FeedGenerator.create(parseEnvironment())
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.FEEDGEN_LISTENHOST}:${server.cfg.FEEDGEN_PORT}`,
  )
}

run()
