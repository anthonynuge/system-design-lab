-- 0001_init: bootstrap schema (users + api_keys only).
-- Later migrations add: requests, idempotency_keys, jobs, webhooks, webhook_deliveries.
-- Indexes are intentionally minimal here so Phase 3 scenario branches have something to fix.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prefix      text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE INDEX api_keys_prefix_idx ON api_keys (prefix);
