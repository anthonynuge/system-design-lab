-- 0004_jobs: backing table for the custom Postgres-backed queue (PR 4).
--
-- Workers poll with:
--   SELECT ... FROM jobs
--   WHERE status = 'pending' AND run_at <= now()
--   ORDER BY run_at
--   FOR UPDATE SKIP LOCKED
--   LIMIT N;
-- Then UPDATE status = 'running', locked_at = now(), locked_by = <worker_id>.
-- On success → 'completed'. On failure → bump attempts, reschedule run_at
-- (exp backoff) or → 'dead' if attempts > max_attempts.
--
-- Why a status string and not an enum? Enums are painful to alter. Plain
-- text + CHECK constraint is fine for a lab and easy to evolve.
--
-- INTENTIONAL OMISSIONS (each enables a scenario):
--   * NO unique constraint on (type, payload_fingerprint).
--     → scenario/worker-double-processing: the *fix* is SKIP LOCKED inside
--       the worker, but a belt-and-braces fix is dedupe at enqueue time.
--       Leaving this off lets you study both.
--   * NO index on locked_at.
--     → scenario/visibility-timeout: a worker crashes mid-job, the row stays
--       'running' with stale locked_at forever. A janitor that resets rows
--       where status='running' AND locked_at < now() - interval needs this
--       index to scan efficiently. You'll add it in the solution branch.
--   * partial index on (status, run_at) is included because without it the
--     poller itself doesn't function — that's a different scenario
--     (scenario/queue-no-poll-index) for a later day.

CREATE TABLE jobs (
  id              bigserial PRIMARY KEY,
  type            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'dead')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 5,
  run_at          timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The hot index. Partial so it stays small once most rows are 'completed'
-- or 'dead'. The worker's polling query targets exactly this predicate.
CREATE INDEX jobs_pending_run_at_idx
  ON jobs (run_at)
  WHERE status = 'pending';

-- For introspection / admin dashboards. Cheap.
CREATE INDEX jobs_type_status_idx ON jobs (type, status);
