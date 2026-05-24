import { createHash, randomBytes } from 'node:crypto';
import { getDb, getPool, closeDb } from '../client.js';

// Seed profiles. Pick one with: `pnpm db:seed -- <profile>`.
//
// The `requests` rows are generated server-side with generate_series so we
// don't make a million round-trips. ~30s for 1M rows on a laptop.
//
// INTENTIONAL: this seed is biased — most rows go to the first api_key.
// That skew is the substrate for scenario/hot-partition (one key takes
// 90% of traffic; rate-limit shard goes hot).
//
// Idempotency: if a `users` row already exists, the seed bails out. To reset,
// `pnpm infra:down && docker compose -f infra/compose/docker-compose.yml down -v`
// then re-migrate.

interface Profile {
  name: string;
  users: number;
  keysPerUser: number;
  totalRequests: number;
  description: string;
}

const PROFILES: Record<string, Profile> = {
  small: {
    name: 'small',
    users: 2,
    keysPerUser: 1,
    totalRequests: 1_000,
    description: 'dev iteration; queries finish instantly',
  },
  medium: {
    name: 'medium',
    users: 10,
    keysPerUser: 5,
    totalRequests: 100_000,
    description: 'k6 smoke runs, dashboards look real',
  },
  large: {
    name: 'large',
    users: 20,
    keysPerUser: 10,
    totalRequests: 1_000_000,
    description: 'scenario/no-index needs this scale to be visible',
  },
};

function pickProfile(): Profile {
  const arg = process.argv[2] ?? 'small';
  const profile = PROFILES[arg];
  if (!profile) {
    const names = Object.keys(PROFILES).join(', ');
    throw new Error(`Unknown profile "${arg}". Available: ${names}`);
  }
  return profile;
}

function generateKey(): { full: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString('hex');
  const full = `sk_seed_${raw}`;
  return {
    full,
    prefix: full.slice(0, 12),
    hash: createHash('sha256').update(full).digest('hex'),
  };
}

async function run(): Promise<void> {
  const profile = pickProfile();
  const db = getDb();
  const pool = getPool();

  const existing = await db
    .selectFrom('users')
    .select(db.fn.countAll<string>().as('count'))
    .executeTakeFirst();

  if (Number(existing?.count ?? 0) > 0) {
    console.log('[seed] users table is non-empty, refusing to seed. Reset volumes to rerun.');
    return;
  }

  console.log(`[seed] profile=${profile.name} (${profile.description})`);
  console.log(
    `[seed] -> ${profile.users} users, ${profile.users * profile.keysPerUser} api_keys, ${profile.totalRequests.toLocaleString()} requests`,
  );

  // users
  const userEmails = Array.from(
    { length: profile.users },
    (_, i) => `user${String(i + 1).padStart(3, '0')}@sdl.local`,
  );
  const userRows = await db
    .insertInto('users')
    .values(userEmails.map((email) => ({ email })))
    .returning(['id'])
    .execute();
  const userIds = userRows.map((r) => r.id);
  console.log(`[seed] inserted ${userIds.length} users`);

  // api_keys
  const keyRows: { user_id: string; prefix: string; key_hash: string }[] = [];
  const printedKeys: string[] = [];
  for (const userId of userIds) {
    for (let i = 0; i < profile.keysPerUser; i++) {
      const k = generateKey();
      keyRows.push({ user_id: userId, prefix: k.prefix, key_hash: k.hash });
      // Only print the first user's first key — enough to curl with.
      if (printedKeys.length < 1) printedKeys.push(k.full);
    }
  }
  const insertedKeys = await db
    .insertInto('api_keys')
    .values(keyRows)
    .returning(['id'])
    .execute();
  console.log(`[seed] inserted ${insertedKeys.length} api_keys`);

  // requests — server-side generate_series. Skew toward the first key to
  // power scenario/hot-partition later.
  const keyIds = insertedKeys.map((r) => r.id);
  console.log(`[seed] generating ${profile.totalRequests.toLocaleString()} requests...`);
  const t0 = Date.now();
  // Distribution: first key gets ~50%, second ~20%, the rest share the remainder.
  // Achieved via a weighted pick using the random_seed-aware random() per row.
  await pool.query(
    `
    INSERT INTO requests (api_key_id, endpoint, status_code, latency_ms, request_id, created_at)
    SELECT
      CASE
        WHEN r < 0.50 THEN ($1::uuid[])[1]
        WHEN r < 0.70 THEN ($1::uuid[])[2]
        ELSE ($1::uuid[])[1 + (floor(random() * array_length($1::uuid[], 1)))::int]
      END AS api_key_id,
      CASE (i % 4)
        WHEN 0 THEN 'POST /v1/events'
        WHEN 1 THEN 'GET /v1/usage'
        WHEN 2 THEN 'POST /v1/events'
        ELSE        'GET /v1/usage'
      END AS endpoint,
      CASE WHEN random() < 0.97 THEN 200
           WHEN random() < 0.5  THEN 429
           ELSE 500 END AS status_code,
      (5 + random() * 250)::int AS latency_ms,
      'seed-' || i::text AS request_id,
      now() - (random() * interval '30 days') AS created_at
    FROM generate_series(1, $2::int) AS i,
         LATERAL (SELECT random() AS r) sub
    `,
    [keyIds, profile.totalRequests],
  );
  console.log(`[seed] requests inserted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (printedKeys[0]) {
    console.log('');
    console.log(`[seed] sample api key (use as Authorization: Bearer ${printedKeys[0]}):`);
    console.log(`        ${printedKeys[0]}`);
  }
}

run()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
