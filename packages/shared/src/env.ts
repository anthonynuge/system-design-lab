import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

dotenvConfig({ path: resolve(findRepoRoot(), '.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  API_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_PORT: z.coerce.number().int().positive().default(3100),
  SCHEDULER_PORT: z.coerce.number().int().positive().default(3200),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  // Per-key rate limit (fixed window). Set deliberately low so a casual
  // curl loop trips it and you can see 429s in Grafana without k6.
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  // Idempotency toggle. Set to "false" on scenario/no-idempotency to
  // demonstrate duplicate writes; leave true on main.
  IDEMPOTENCY_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
