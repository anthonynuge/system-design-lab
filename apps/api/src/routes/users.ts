import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '@sdl/db';

const router = Router();

const CreateUserBody = z.object({
  email: z.string().email(),
});

// POST /v1/users
// No auth — bootstrap. In a real system this would be hidden behind a
// signup flow with email verification. Out of scope for the lab.
router.post('/users', async (req: Request, res: Response) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    return;
  }

  try {
    const row = await getDb()
      .insertInto('users')
      .values({ email: parsed.data.email })
      .returning(['id', 'email', 'created_at'])
      .executeTakeFirstOrThrow();
    res.status(201).json(row);
  } catch (err) {
    // Unique violation on email.
    if (err instanceof Error && err.message.includes('users_email_key')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already exists' } });
      return;
    }
    throw err;
  }
});

export default router;
