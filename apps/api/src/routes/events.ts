import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '@sdl/db';
import { authApiKey, type AuthedRequest } from '../middleware/auth-api-key.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { idempotency } from '../middleware/idempotency.js';

const router = Router();

const CreateEventBody = z.object({
  type: z.string().min(1).max(64),
  properties: z.record(z.unknown()).optional(),
});

// POST /v1/events
//
// Middleware order matters:
//   authApiKey  -> we need apiKey.id for everything downstream
//   rateLimit   -> reject excess before we burn DB writes on idempotency
//   idempotency -> wraps the handler; replay or capture
router.post(
  '/events',
  authApiKey(),
  rateLimit(),
  idempotency(),
  async (req: Request, res: Response) => {
    const t0 = Date.now();
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      return;
    }

    const apiKey = (req as AuthedRequest).apiKey;
    const requestId = req.headers['x-request-id'] as string;

    // Write the event log row. In v4 this also enqueues a `process_event` job.
    await getDb()
      .insertInto('requests')
      .values({
        api_key_id: apiKey.id,
        endpoint: 'POST /v1/events',
        status_code: 202,
        latency_ms: Date.now() - t0,
        request_id: requestId,
      })
      .execute();

    res.status(202).json({
      accepted: true,
      type: parsed.data.type,
      request_id: requestId,
    });
  },
);

export default router;
