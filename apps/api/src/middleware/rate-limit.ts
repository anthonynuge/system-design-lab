import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '@sdl/redis';
import { loadEnv } from '@sdl/shared/env';
import { rateLimitDecisionsTotal } from '@sdl/metrics';
import type { AuthedRequest } from './auth-api-key.js';

// Per-api-key fixed-window rate limiter.
//
// INTENTIONAL — this is the NAIVE implementation. Powers two scenarios:
//
//   scenario/rate-limiter-race:
//     We read the counter, decide, then INCR. Two requests interleave
//     between the GET and the INCR and both pass. Solution branch
//     converts this to a single atomic Lua script.
//
//   scenario/rate-limiter-boundary:
//     Fixed windows have the classic boundary problem: 2 * MAX requests
//     can pass within a 1-second span if they straddle the window edge.
//     Solution branch swaps to sliding window or token bucket.
//
// Also intentionally missing:
//   - no Retry-After header (scenario/retry-after-missing)
//   - no per-route limits (scenario/per-route-limits)
//   - no dynamic limits from a plans table (future)

export function rateLimit() {
  const env = loadEnv();
  const redis = getRedis();
  const max = env.RATE_LIMIT_MAX_REQUESTS;
  const windowSec = env.RATE_LIMIT_WINDOW_SECONDS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = (req as AuthedRequest).apiKey;
    if (!apiKey) {
      // Auth middleware must run first. If it didn't, we have a wiring bug,
      // not an auth failure — fail loud.
      next(new Error('rateLimit() requires authApiKey() upstream'));
      return;
    }

    // Window number floors the current timestamp into the active bucket.
    const windowNumber = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${apiKey.id}:${windowNumber}`;

    // ⚠ NAIVE on purpose: GET then INCR are two round-trips with a race in
    // between. See scenario/rate-limiter-race.
    const currentRaw = await redis.get(key);
    const current = currentRaw ? Number(currentRaw) : 0;

    if (current >= max) {
      rateLimitDecisionsTotal.inc({ decision: 'rejected', api_key_prefix: apiKey.prefix });
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Exceeded ${max} requests per ${windowSec}s`,
        },
      });
      return;
    }

    // Increment and (re)set the TTL. EXPIRE is only meaningful on the first
    // INCR of a window; on subsequent INCRs we re-set it which is harmless.
    await redis.incr(key);
    await redis.expire(key, windowSec);

    rateLimitDecisionsTotal.inc({ decision: 'allowed', api_key_prefix: apiKey.prefix });
    next();
  };
}
