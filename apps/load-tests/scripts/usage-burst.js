// usage-burst.js
//
// Sustains a moderate request rate against GET /v1/usage to expose the
// missing composite index on requests(api_key_id, created_at DESC).
//
// What to watch:
//   - k6 output: http_req_duration p95/p99 climbs as the dataset grows
//   - Grafana: api p95/p99 latency, postgres CPU
//   - psql: EXPLAIN ANALYZE SELECT ... FROM requests WHERE api_key_id=...
//     ORDER BY created_at DESC LIMIT 100;
//     -> Seq Scan + Sort on the scenario branch
//     -> Index Scan (Backward) on solution/index-added
//
// Required env:
//   BASE_URL  default http://localhost:3000
//   API_KEY   required: sk_live_* from POST /v1/api-keys

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY;

if (!API_KEY) {
  throw new Error('API_KEY env var is required');
}

const usageLatency = new Trend('sdl_usage_latency_ms', true);

export const options = {
  // Bump rate-limit on the api side first (RATE_LIMIT_MAX_REQUESTS=10000)
  // or this will produce mostly 429s instead of the latency signal we want.
  scenarios: {
    sustained: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 req/s
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    // Fail the run if p95 > 1s. Useful as a regression gate after fixes.
    'http_req_duration{expected_response:true}': ['p(95)<1000'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/v1/usage?limit=100`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    tags: { endpoint: 'usage' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
  });

  usageLatency.add(res.timings.duration);
}
