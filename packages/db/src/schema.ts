import type { Generated, ColumnType } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  created_at: Generated<Timestamp>;
}

export interface ApiKeysTable {
  id: Generated<string>;
  user_id: string;
  prefix: string;
  key_hash: string;
  created_at: Generated<Timestamp>;
  revoked_at: Timestamp | null;
}

export interface RequestsTable {
  id: Generated<number>;
  api_key_id: string;
  endpoint: string;
  status_code: number;
  latency_ms: number;
  request_id: string;
  created_at: Generated<Timestamp>;
}

// INTENTIONAL: response_body is jsonb. We capture the response as JSON
// so replay is trivial. Doesn't generalize to binary responses — that's
// a future scenario (scenario/idempotency-binary-response).
export interface IdempotencyKeysTable {
  api_key_id: string;
  key: string;
  request_fingerprint: string;
  status_code: number;
  response_body: unknown;
  created_at: Generated<Timestamp>;
}

export interface JobsTable {
  id: Generated<number>;
  type: string;
  payload: unknown;
  status: 'pending' | 'running' | 'completed' | 'dead';
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  run_at: Generated<Timestamp>;
  locked_at: Timestamp | null;
  locked_by: string | null;
  last_error: string | null;
  request_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface WebhooksTable {
  id: Generated<string>;
  user_id: string;
  url: string;
  secret: string;
  enabled: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export interface WebhookDeliveriesTable {
  id: Generated<number>;
  webhook_id: string;
  event_type: string;
  payload: unknown;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  next_attempt_at: Generated<Timestamp>;
  last_status_code: number | null;
  last_response: string | null;
  last_error: string | null;
  request_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Database {
  users: UsersTable;
  api_keys: ApiKeysTable;
  requests: RequestsTable;
  idempotency_keys: IdempotencyKeysTable;
  jobs: JobsTable;
  webhooks: WebhooksTable;
  webhook_deliveries: WebhookDeliveriesTable;
}
