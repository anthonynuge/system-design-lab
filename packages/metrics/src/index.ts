import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

// One registry per process. Each service calls `initMetrics({ service: 'api' })`
// at boot so every series carries a `service=` label without per-metric work.
//
// We define the platform's common metrics here so api, worker, scheduler all
// emit the same names. Service-specific metrics still get created inline in
// the service that owns them.
//
// INTENTIONAL: bucket boundaries below cap at 10s. If real p99s exceed 10s
// they'll all land in the +Inf bucket and become invisible. That's a bucket-
// design lesson for a later scenario (scenario/wrong-buckets).

export const registry = new Registry();

export interface InitOptions {
  service: string;
  collectDefault?: boolean;
}

let initialized = false;

export function initMetrics(opts: InitOptions): Registry {
  if (initialized) return registry;
  registry.setDefaultLabels({ service: opts.service });
  if (opts.collectDefault !== false) {
    collectDefaultMetrics({ register: registry });
  }
  initialized = true;
  return registry;
}

// HTTP metrics — used by the api's middleware and any other service that
// exposes HTTP. Workers/scheduler still get `/metrics` for scraping but
// won't increment these.
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Rate-limit decision metric (used by api middleware in v3).
export const rateLimitDecisionsTotal = new Counter({
  name: 'rate_limit_decisions_total',
  help: 'Rate limit decisions',
  labelNames: ['decision', 'api_key_prefix'] as const,
  registers: [registry],
});

// Queue metrics — used by packages/queue and the worker (v4).
export const queueJobsEnqueuedTotal = new Counter({
  name: 'queue_jobs_enqueued_total',
  help: 'Jobs enqueued',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const queueJobsProcessedTotal = new Counter({
  name: 'queue_jobs_processed_total',
  help: 'Jobs finished (any terminal state)',
  labelNames: ['type', 'outcome'] as const,
  registers: [registry],
});

export const queueJobDurationSeconds = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Job handler duration',
  labelNames: ['type', 'outcome'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Pending jobs by type',
  labelNames: ['type'] as const,
  registers: [registry],
});

// Re-exported so consumers don't need a separate prom-client dep just to
// define service-local metrics.
export { Counter, Gauge, Histogram };
