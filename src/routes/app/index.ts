import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { html } from 'hono/html';
import type { AppEnv } from '../../app-context';
import { readSession } from '../../auth/session';
import { membershipsFor, trucksFor } from '../../db/brands';
import { rallyPage } from '../../views/layout';
import { onboarding } from './onboarding';
import { team } from './team';

const BRAND_COOKIE = '__Host-rally_b';

export const app = new Hono<AppEnv>();

/** Every /app route needs a signed-in operator. */
app.use('*', async (c, next) => {
  const operator = await readSession(c);
  if (!operator) {
    const next_ = new URL(c.req.url).pathname;
    return c.redirect(`/login${c.req.method === 'GET' && next_ !== '/app' ? `?next=${encodeURIComponent(next_)}` : ''}`);
  }
  c.set('operator', operator);
  c.set('memberships', await membershipsFor(c.env.DB, operator.id));
  c.header('Cache-Control', 'no-store');
  await next();
});

app.route('/onboarding', onboarding);

/** Everything else needs a brand. The current one is remembered in a cookie, validated against memberships. */
app.use('*', async (c, next) => {
  const ms = c.get('memberships');
  if (!ms.length) return c.redirect('/app/onboarding');
  const wanted = getCookie(c, BRAND_COOKIE);
  c.set('brand', ms.find((m) => m.brand_id === wanted) ?? ms[0]!);
  await next();
});

app.post('/brand', async (c) => {
  const id = String((await c.req.parseBody()).brand_id ?? '');
  if (c.get('memberships').some((m) => m.brand_id === id)) {
    setCookie(c, BRAND_COOKIE, id, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 365 * 86400 });
  }
  return c.redirect('/app', 303);
});

app.get('/', async (c) => {
  const brand = c.get('brand');
  const trucks = await trucksFor(c.env.DB, brand.brand_id);
  return c.html(rallyPage({
    title: 'Today',
    chrome: { operator: c.get('operator'), brand, memberships: c.get('memberships'), current: 'today' },
    body: html`
      <div class="spread">
        <h1>${brand.name}</h1>
        <span class="pill neutral">${brand.role === 'owner' ? 'Owner' : 'Crew'}</span>
      </div>
      <section class="card">
        <h2>Today</h2>
        <p class="muted">Nothing scheduled. Shifts arrive in the next build step.</p>
      </section>
      <section class="panel">
        <h2>Trucks</h2>
        <ul class="plain">${trucks.map((t) => html`<li>${t.name}</li>`)}</ul>
      </section>
      <section class="panel">
        <div class="spread"><h2>Followers</h2><span class="num">0</span></div>
        <p class="muted">Public page: <span class="data">/${brand.slug}/</span></p>
      </section>`,
  }));
});

app.route('/team', team);
