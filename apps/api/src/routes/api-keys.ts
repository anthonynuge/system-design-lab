import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '@sdl/db';

const router = Router();

// POST /v1/api-keys
//
// Auth: Authorization: Bearer <user-uuid>
//
// INTENTIONAL: this is dummy "auth" — the user proves identity by knowing
// their own UUID. There is no signup/login/JWT flow in this repo. Real auth
// is out of scope; this endpoint exists to bootstrap callers so they can
// then exercise the *actual* api-key flow on /v1/events and /v1/usage.
//
// The api-key returned here is shown ONCE (just like Stripe, Twilio).
// We store only sha256(key); we cannot recover the plaintext.
router.post('/api-keys', async (req: Request, res: Response) => {
  const auth = req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing user token' } });
    return;
  }
  const userId = auth.slice('Bearer '.length).trim();
  // UUID v4 shape check, not validation. A real server would validate the
  // token cryptographically.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid user token' } });
    return;
  }

  const db = getDb();
  const userExists = await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!userExists) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unknown user' } });
    return;
  }

  const raw = randomBytes(24).toString('hex');
  const full = `sk_live_${raw}`;
  const prefix = full.slice(0, 12);
  const hash = createHash('sha256').update(full).digest('hex');

  const row = await db
    .insertInto('api_keys')
    .values({ user_id: userId, prefix, key_hash: hash })
    .returning(['id', 'prefix', 'created_at'])
    .executeTakeFirstOrThrow();

  res.status(201).json({
    id: row.id,
    prefix: row.prefix,
    key: full, // ⚠ shown once, never again
    created_at: row.created_at,
  });
});

export default router;
