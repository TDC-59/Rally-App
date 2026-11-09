import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
          // never let a test cron or queue talk to the network
          outboundService: () => new Response('blocked in tests', { status: 599 }),
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'] },
  };
});
