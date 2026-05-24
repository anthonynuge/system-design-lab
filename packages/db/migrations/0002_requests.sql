-- 0002_requests: append-only event log of every authenticated API call.
--
-- Every successful (or rejected) call to a /v1/* endpoint writes one row here.
-- This is the table that /v1/usage aggregates from, and the table the seed
-- script will pump to millions of rows. It is the centerpiece of the
-- no-index, bad-pagination, and hot-partition scenarios.
--
-- INTENTIONAL OMISSIONS (do not "fix" these without opening a scenario branch):
--   * NO composite index on (api_key_id, created_at DESC).
--     The /v1/usage query will need this to be fast. Without it, EXPLAIN will
--     show a Seq Scan + Sort, and p99 latency will be observable in Grafana
--     once the seed loads ~1M rows. This is the entire point of
--     scenario/no-index.
--   * NO partial index, NO BRIN on created_at. Add later as separate
--     scenarios if you want to study them.

CREATE TABLE requests (
  id          bigserial PRIMARY KEY,
  api_key_id  uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  status_code smallint NOT NULL,
  latency_ms  integer NOT NULL,
  request_id  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- request_id is the X-Request-ID header propagated from the api into worker
-- jobs. Indexed because you will grep by it during incident replay (Phase 2
-- adds Loki-style log↔metric correlation).
CREATE INDEX requests_request_id_idx ON requests (request_id);
