import { Redis } from 'ioredis';
import { loadEnv } from '@sdl/shared/env';

// Lazy singleton. The first call wires up the connection; later calls reuse it.
// Closing is exported for graceful shutdown in api/worker/scheduler.
//
// INTENTIONAL OMISSIONS:
//   * NO cluster client, no read/write split, no Sentinel awareness.
//     A single node is correct for the lab. Scaling out is its own scenario.
//   * NO automatic key prefixing per service. Bare keys make it easy to read
//     in `redis-cli MONITOR` and easy to collide on purpose (scenario/key-collision).
//   * `maxRetriesPerRequest` is left at the ioredis default (20). When you
//     work scenario/redis-down you'll feel this and may want to tune it.

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;
  const env = loadEnv();
  client = new Redis(env.REDIS_URL, {
    // Fail fast on first connect so /readyz reports the real state.
    lazyConnect: false,
    enableReadyCheck: true,
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = undefined;
}

export { Redis };
