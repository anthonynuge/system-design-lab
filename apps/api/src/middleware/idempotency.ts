import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '@sdl/db';
import { loadEnv } from '@sdl/shared/env';
import type { AuthedRequest } from './auth-api-key.js';

// Replay-cache idempotency for mutating requests.
//
// Caller sends `Idempotency-Key: <opaque-string>` on a POST. We:
//   1. Compute fingerprint = sha256(method + path + sorted-body)
//   2. Look up (api_key_id, key) in idempotency_keys
//   3. Hit + matching fingerprint -> replay the stored response
//   4. Hit + DIFFERENT fingerprint -> 409 (same key, different request body)
//   5. Miss -> run the handler, capture res.json() output, store, return
//
// INTENTIONAL OMISSIONS:
//   * Can be disabled via IDEMPOTENCY_ENABLED=false in env, which is how
//     scenario/no-idempotency demonstrates duplicate writes.
//   * NO concurrency control. Two simultaneous requests with the same key
//     race to insert; the second will hit a PK conflict and currently 500s.
//     Future scenario/idempotency-race adds row-level locking or unique-
//     violation retry.
//   * Captures only res.json() output. Non-JSON responses (binary, redirect)
//     aren't replayable. Future scenario/idempotency-binary-response.
//   * No TTL. Rows accumulate. Future scenario/idempotency-bloat.
//   * Header is optional. If absent, middleware no-ops (idempotency is opt-in).

const HEADER = 'idempotency-key';

function fingerprint(req: Request): string {
  // Stable JSON: keys sorted so {a:1,b:2} and {b:2,a:1} produce the same hash.
  const body = req.body ?? {};
  const sortedJson = JSON.stringify(body, Object.keys(body).sort());
  return createHash('sha256')
    .update(`${req.method}\n${req.path}\n${sortedJson}`)
    .digest('hex');
}

export function idempotency() {
  const env = loadEnv();
  if (!env.IDEMPOTENCY_ENABLED) {
    // Disabled: middleware is a no-op so scenario/no-idempotency can run
    // without code changes.
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header(HEADER);
    if (!key) {
      // Idempotency is opt-in. No header, no replay.
      next();
      return;
    }

    const apiKey = (req as AuthedRequest).apiKey;
    if (!apiKey) {
      next(new Error('idempotency() requires authApiKey() upstream'));
      return;
    }

    const fp = fingerprint(req);
    const db = getDb();
    const cached = await db
      .selectFrom('idempotency_keys')
      .select(['request_fingerprint', 'status_code', 'response_body'])
      .where('api_key_id', '=', apiKey.id)
      .where('key', '=', key)
      .executeTakeFirst();

    if (cached) {
      if (cached.request_fingerprint !== fp) {
        res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_MISMATCH',
            message: 'Idempotency-Key reused with a different request body',
          },
        });
        return;
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(cached.status_code).json(cached.response_body);
      return;
    }

    // Capture the response by wrapping res.json. After the handler runs,
    // we insert into idempotency_keys. INTENTIONAL: this is best-effort —
    // if the insert fails (e.g. PK race), we still send the response;
    // the client just won't get replay protection if they retry.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const statusCode = res.statusCode;
      // Fire-and-forget the store; don't block the response.
      void db
        .insertInto('idempotency_keys')
        .values({
          api_key_id: apiKey.id,
          key,
          request_fingerprint: fp,
          status_code: statusCode,
          response_body: body as object,
        })
        .onConflict((oc) => oc.doNothing())
        .execute()
        .catch((err) => req.log?.warn?.({ err }, 'idempotency cache store failed'));
      return originalJson(body);
    };

    next();
  };
}
