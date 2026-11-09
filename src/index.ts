import { Hono } from 'hono';
import { spike } from './routes/spike';
import { staticFiles } from './static';

const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/', staticFiles);
app.route('/', spike);

export default {
  fetch: app.fetch,
  // consumers and crons arrive in steps 7 and 10
  async queue(batch: MessageBatch, _env: Env, _ctx: ExecutionContext) { batch.ackAll(); },
  async scheduled(_c: ScheduledController, _env: Env, _ctx: ExecutionContext) {},
} satisfies ExportedHandler<Env>;
