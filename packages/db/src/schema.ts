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

export interface Database {
  users: UsersTable;
  api_keys: ApiKeysTable;
}
