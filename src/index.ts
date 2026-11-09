import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { spike } from './routes/spike';
import { staticFiles } from './static';
import { auth } from './routes/auth';
import { app as consoleApp } from './routes/app/index';
import { runCron } from './cron';

export const app = new Hono<{ Bindings: Env }>();

app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: 'same-origin' }));
// Form POSTs must come from our own origin. JSON endpoints are covered by CORS preflight.
app.use('*', csrf());

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/', staticFiles);
app.route('/', spike);
app.route('/', auth);
app.route('/app', consoleApp);

export default {
  fetch: app.fetch,
  // queue consumer arrives in step 7
  async queue(batch: MessageBatch, _env: Env, _ctx: ExecutionContext) { batch.ackAll(); },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(controller.cron, env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
