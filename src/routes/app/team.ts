import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../../app-context';
import { requireRole } from './guards';
import { membersOf, removeMember, setMembership, type Role } from '../../db/brands';
import { upsertOperatorByEmail } from '../../db/operators';
import { isPlausibleEmail, issueLoginToken, LOGIN_TOKEN_TTL, normalizeEmail } from '../../auth/tokens';
import { mailerFor } from '../../email/mailer';
import { invitedEmail } from '../../email/templates';
import { rallyPage, errorList } from '../../views/layout';

export const team = new Hono<AppEnv>();
team.use('*', requireRole('owner'));

async function render(c: import('hono').Context<AppEnv>, opts: { errors?: Record<string, string>; flash?: string; status?: 200 | 400 | 409 } = {}) {
  const brand = c.get('brand');
  const me = c.get('operator');
  const members = await membersOf(c.env.DB, brand.brand_id);
  return c.html(rallyPage({
    title: 'Team',
    chrome: { operator: me, brand, memberships: c.get('memberships'), current: 'team' },
    body: html`
      <h1>Team</h1>
      ${opts.flash ? html`<div class="notice ok" role="status"><strong>${opts.flash}</strong></div>` : ''}
      ${errorList(opts.errors ?? {})}
      <section class="card">
        <h2>Add someone</h2>
        <p class="muted">Crew can open and close shifts. Owners can also change the brand, trucks, team, and integrations.</p>
        <form method="post" action="/app/team">
          <label>Email <input type="email" name="email" required autocomplete="off" inputmode="email"></label>
          <label>Role
            <select name="role"><option value="crew">Crew</option><option value="owner">Owner</option></select>
          </label>
          <button>Add and email a sign-in link</button>
        </form>
      </section>
      <section class="panel">
        <h2>Members</h2>
        <ul class="plain members">
        ${members.map((m) => html`<li class="member">
          <div class="who">${m.name ? html`<strong>${m.name}</strong><span class="muted">${m.email}</span>` : html`<span>${m.email}</span>`}${m.operator_id === me.id ? html`<span class="muted">You</span>` : ''}</div>
          <div class="row">
            <span class="pill ${m.role === 'owner' ? 'info' : 'neutral'}">${m.role === 'owner' ? 'Owner' : 'Crew'}</span>
            <form method="post" action="/app/team/${m.operator_id}/remove"><button class="quiet">Remove</button></form>
          </div>
        </li>`)}
        </ul>
      </section>`,
  }), opts.status ?? 200);
}

team.get('/', (c) => render(c));

team.post('/', async (c) => {
  const b = await c.req.parseBody();
  const email = normalizeEmail(String(b.email ?? ''));
  const role: Role = b.role === 'owner' ? 'owner' : 'crew';
  if (!isPlausibleEmail(email)) return render(c, { errors: { email: 'Enter a full email address.' }, status: 400 });

  const brand = c.get('brand');
  const operatorId = await upsertOperatorByEmail(c.env.DB, email);
  if (!(await setMembership(c.env.DB, brand.brand_id, operatorId, role))) {
    return render(c, { errors: { role: 'A brand needs at least one owner. Add another owner first.' }, status: 409 });
  }
  const token = await issueLoginToken(c.env.DB, email);
  if (token) {
    const link = new URL(`/auth/${token}`, c.req.url).toString();
    await mailerFor(c.env).send(invitedEmail(email, brand.name, role === 'owner' ? 'an owner' : 'crew', link, LOGIN_TOKEN_TTL / 60));
  }
  return render(c, { flash: `Added ${email}.` });
});

team.post('/:operatorId/remove', async (c) => {
  if (!(await removeMember(c.env.DB, c.get('brand').brand_id, c.req.param('operatorId')))) {
    return render(c, { errors: { remove: 'A brand needs at least one owner. Make someone else an owner first.' }, status: 409 });
  }
  return c.redirect('/app/team', 303);
});
