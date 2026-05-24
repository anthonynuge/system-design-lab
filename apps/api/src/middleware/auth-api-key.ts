import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '@sdl/db';

// API-key authentication.
//
// Flow:
//   1. Extract `Authorization: Bearer sk_*`
//   2. Look up api_keys row by `prefix` (indexed) — at most one match
//   3. Constant-time compare sha256(provided) against `key_hash`
//   4. Reject if revoked
//   5. Attach { id, userId } to req for downstream handlers
//
// INTENTIONAL OMISSIONS:
//   * NO cache. Every request hits Postgres. Future scenario/auth-cache
//     adds an LRU then a Redis cache and you measure the impact.
//   * NO rate-limit-by-IP fallback when auth fails. Brute-force friendly.
//     Future scenario/auth-brute-force adds it.
//   * NO key rotation grace window. Once revoked, instantly dead.

export interface AuthedRequest extends Request {
  apiKey: { id: string; userId: string; prefix: string };
}

export function authApiKey() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer sk_')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or malformed API key' } });
      return;
    }

    const key = header.slice('Bearer '.length);
    // Prefix length matches what the seed/generation uses: 'sk_seed_' + 4 hex chars
    // == 12 chars, OR 'sk_live_' + 4 == 12. The api_keys.prefix column stores
    // exactly this many chars.
    const prefix = key.slice(0, 12);

    const row = await getDb()
      .selectFrom('api_keys')
      .select(['id', 'user_id', 'key_hash', 'revoked_at'])
      .where('prefix', '=', prefix)
      .executeTakeFirst();

    if (!row) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    if (row.revoked_at !== null) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key revoked' } });
      return;
    }

    const provided = createHash('sha256').update(key).digest();
    const stored = Buffer.from(row.key_hash, 'hex');
    // Buffers must be the same length for timingSafeEqual; sha256 is always 32 bytes.
    if (stored.length !== provided.length || !timingSafeEqual(stored, provided)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    (req as AuthedRequest).apiKey = { id: row.id, userId: row.user_id, prefix };
    next();
  };
}
