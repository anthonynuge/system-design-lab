-- 0003_idempotency_keys: cache of the response for an Idempotency-Key header.
--
-- POST /v1/events accepts an `Idempotency-Key` header. On a hit we replay
-- the cached response instead of re-doing the write. PK on (api_key_id, key)
-- scopes the key to the caller so two tenants can reuse the same string.
--
-- request_fingerprint is sha256(method + path + sorted-body-keys + body-hash).
-- If a caller reuses the same Idempotency-Key but with a *different* body, we
-- return 409 instead of silently replaying. That mismatch check is the
-- difference between safe idempotency and a foot-gun.
--
-- INTENTIONAL OMISSIONS:
--   * NO TTL / cleanup job. Rows accumulate forever until you add one in
--     Phase 2 (scheduler enqueues a `prune_idempotency` job). Lets you
--     observe table bloat first.
--   * NO unique constraint on request_fingerprint alone — the same body
--     under two different keys is legal.

CREATE TABLE idempotency_keys (
  api_key_id            uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  key                   text NOT NULL,
  request_fingerprint   text NOT NULL,
  status_code           smallint NOT NULL,
  response_body         jsonb NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, key)
);

-- For the future prune job: "delete where created_at < now() - interval '24h'".
CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);
