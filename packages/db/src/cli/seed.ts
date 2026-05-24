import { getDb, closeDb } from '../client.js';

async function run(): Promise<void> {
  const db = getDb();
  const existing = await db
    .selectFrom('users')
    .select(db.fn.countAll<string>().as('count'))
    .executeTakeFirst();

  if (Number(existing?.count ?? 0) > 0) {
    console.log('[seed] users table is non-empty, skipping');
    return;
  }

  await db
    .insertInto('users')
    .values([
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
    ])
    .execute();

  console.log('[seed] inserted bootstrap users');
}

run()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
