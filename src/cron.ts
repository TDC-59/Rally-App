// One scheduled handler, dispatched on the cron expression (see wrangler.jsonc).

export async function runCron(cron: string, env: Env, scheduledTimeMs: number): Promise<void> {
  const now = Math.floor(scheduledTimeMs / 1000);
  switch (cron) {
    case '0 4 * * *':
      await env.DB.batch([
        env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?1').bind(now - 86400),
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
      ]);
      return;
    default:
      return; // */5 and */15 jobs arrive with shifts, push, and Google Calendar
  }
}
