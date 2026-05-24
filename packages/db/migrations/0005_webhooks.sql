-- 0005_webhooks: outbound webhook configs + per-event delivery attempts.
--
-- A user registers a webhook URL. When their account produces an event
-- (e.g. a `process_event` job completes), the worker enqueues a
-- `deliver_webhook` job which inserts a row in webhook_deliveries and
-- POSTs to the URL with an HMAC signature.
--
-- webhook_deliveries is the table that demonstrates retry-storm dynamics:
--   - downstream returns 500
--   - delivery row goes back to status='pending' with bumped attempts and
--     next_attempt_at = now() + backoff
--   - the worker re-picks it
--
-- INTENTIONAL OMISSIONS:
--   * NO jitter column. The naive solution branch will add backoff WITHOUT
--     jitter, then the next branch adds jitter and shows the thundering-herd
--     difference in Grafana. → scenario/retry-storm → solution/backoff-jitter.
--   * NO circuit breaker state per webhook. A repeatedly-failing endpoint
--     will keep being retried until max_attempts. The circuit-breaker
--     solution branch will add a `consecutive_failures` + `circuit_open_until`
--     column to the webhooks table.
--   * NO HMAC version column. When you rotate signing schemes you'll regret
--     this — and that's a scenario too.

CREATE TABLE webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  secret      text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhooks_user_id_idx ON webhooks (user_id);

CREATE TABLE webhook_deliveries (
  id                bigserial PRIMARY KEY,
  webhook_id        uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  attempts          integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 8,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  last_status_code  smallint,
  last_response     text,
  last_error        text,
  request_id        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- The delivery worker's polling index. Same partial-index trick as jobs.
CREATE INDEX webhook_deliveries_pending_idx
  ON webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

-- For an admin "show me failures for this webhook" query.
CREATE INDEX webhook_deliveries_webhook_status_idx
  ON webhook_deliveries (webhook_id, status);
