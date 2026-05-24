import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sql, type SqlBool } from 'kysely';
import { getDb } from '@sdl/db';
import { authApiKey, type AuthedRequest } from '../middleware/auth-api-key.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();

const UsageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  since: z.coerce.date().optional(),
});

// GET /v1/usage
//
// Returns recent requests for the caller's api_key plus a count rollup.
//
// INTENTIONAL — this endpoint is the target of two scenarios:
//
//   scenario/no-index:
//     The WHERE api_key_id = $1 ORDER BY created_at DESC requires a
//     composite index on (api_key_id, created_at DESC). It is missing
//     from migration 0002 on purpose. Run /v1/usage against a `large`
//     seed (1M rows) — EXPLAIN will show a seq scan + sort, and p99
//     in Grafana will be embarrassing.
//
//   scenario/bad-pagination:
//     We use OFFSET/LIMIT. At ?offset=100000 Postgres scans-and-discards
//     all prior rows. Solution branch swaps to keyset pagination on
//     (created_at, id) and benchmarks the difference.
router.get('/usage', authApiKey(), rateLimit(), async (req: Request, res: Response) => {
  const parsed = UsageQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    return;
  }
  const { limit, offset, since } = parsed.data;
  // Kysely's generated column types expect the ColumnType wrapper; passing
  // a string (ISO timestamp) sidesteps that and Postgres parses it natively.
  const sinceIso = since?.toISOString();
  const apiKey = (req as AuthedRequest).apiKey;
  const db = getDb();

  let query = db
    .selectFrom('requests')
    .select(['endpoint', 'status_code', 'latency_ms', 'request_id', 'created_at'])
    .where('api_key_id', '=', apiKey.id)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  if (sinceIso) query = query.where(sql<SqlBool>`created_at >= ${sinceIso}`);

  // Two queries: the rows + a count. The count is the worst offender on
  // a missing index — it scans every matching row.
  const [rows, countRow] = await Promise.all([
    query.execute(),
    db
      .selectFrom('requests')
      .select(sql<string>`count(*)`.as('total'))
      .where('api_key_id', '=', apiKey.id)
      .$if(sinceIso !== undefined, (qb) => qb.where(sql<SqlBool>`created_at >= ${sinceIso}`))
      .executeTakeFirst(),
  ]);

  res.json({
    total: Number(countRow?.total ?? 0),
    limit,
    offset,
    items: rows,
  });
});

export default router;
