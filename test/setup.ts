import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';
import { setMailerForTests } from '../src/email/mailer';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Children before parents, so foreign keys never block the reset.
const TABLES = [
  'gcal_connections', 'shift_ig_stats', 'brand_daily_stats', 'pushes', 'followers',
  'shifts', 'series', 'sessions', 'login_tokens', 'memberships', 'trucks', 'operators', 'brands',
];

beforeEach(async () => {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  const keys = await env.CACHE.list();
  await Promise.all(keys.keys.map((k) => env.CACHE.delete(k.name)));
  setMailerForTests(undefined);
});
