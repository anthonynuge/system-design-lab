-- 0006_requests_api_key_created_at_idx
--
-- The fix for scenario/no-index. See docs/incidents/0001-no-index.md.
--
-- The query that motivates this index:
--   SELECT ... FROM requests
--   WHERE api_key_id = $1
--   ORDER BY created_at DESC
--   LIMIT 100;
--
-- Without an index, Postgres does a Seq Scan on requests and a top-N sort.
-- With this composite, Postgres uses a Backward Index Scan and skips the
-- sort entirely.
--
-- Column ordering rationale:
--   - api_key_id first: equality predicate. Must be a left-anchored
--     index column or the index is useless for this WHERE clause.
--   - created_at DESC second: range / order. Matching the query's ORDER
--     BY direction means no sort node, and LIMIT can short-circuit.
--
-- Production note:
--   We write `CREATE INDEX` here, not `CREATE INDEX CONCURRENTLY`. CONCURRENTLY
--   would avoid blocking writes during the build, but it cannot run inside
--   a transaction — and our migration runner wraps every file in BEGIN/COMMIT.
--   Resolving that is its own future scenario (scenario/concurrent-index-migration).

CREATE INDEX requests_api_key_created_at_idx
  ON requests (api_key_id, created_at DESC);
