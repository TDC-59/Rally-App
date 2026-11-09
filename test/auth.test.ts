import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE, cookiesFrom, form, freshMailer, linkFrom, onboard, req, signIn } from './helpers';
import { consumeLoginToken, issueLoginToken } from '../src/auth/tokens';
import type { MemoryMailer } from '../src/email/mailer';

let mailer: MemoryMailer;
beforeEach(() => { mailer = freshMailer(); });

describe('magic link sign-in', () => {
  it('emails a link and stores only its hash', async () => {
    const res = await req('/login', form({ email: '  Tony@Example.COM ' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Check your email');
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]!.to).toBe('tony@example.com');

    const token = linkFrom(mailer).split('/').pop()!;
    const rows = await env.DB.prepare('SELECT token_hash, email FROM login_tokens').all<{ token_hash: string; email: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.token_hash).not.toBe(token);
    expect(rows.results[0]!.email).toBe('tony@example.com');
  });

  it('GET on the link does not consume it (mail scanners prefetch links)', async () => {
    await req('/login', form({ email: 'a@example.com' }));
    const link = linkFrom(mailer);
    expect((await req(link)).status).toBe(200);
    expect((await req(link)).status).toBe(200);
    expect((await req(link, { method: 'POST' })).status).toBe(303);
  });

  it('POST on the link signs in with a hardened cookie, once', async () => {
    await req('/login', form({ email: 'a@example.com' }));
    const link = linkFrom(mailer);
    const res = await req(link, { method: 'POST' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/app');
    const sc = res.headers.getSetCookie().find((c) => c.startsWith('__Host-rally_s='))!;
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).not.toMatch(/Domain=/i);

    const again = await req(link, { method: 'POST' });
    expect(again.status).toBe(410);
    expect(again.headers.getSetCookie()).toHaveLength(0);
  });

  it('rejects expired tokens', async () => {
    const now = 1_800_000_000;
    const token = (await issueLoginToken(env.DB, 'x@example.com', now))!;
    expect(await consumeLoginToken(env.DB, token, now + 15 * 60 + 1)).toBeNull();
    const fresh = (await issueLoginToken(env.DB, 'x@example.com', now))!;
    expect(await consumeLoginToken(env.DB, fresh, now + 60)).toBe('x@example.com');
  });

  it('says the same thing for any address, and stops mailing after 5 an hour', async () => {
    for (let i = 0; i < 7; i++) {
      const res = await req('/login', form({ email: 'spam@example.com' }));
      expect(await res.text()).toContain('Check your email');
    }
    expect(mailer.outbox).toHaveLength(5);
  });

  it('rejects a malformed address with a message', async () => {
    const res = await req('/login', form({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('full email address');
    expect(mailer.outbox).toHaveLength(0);
  });

  it('one operator per email, whatever the case', async () => {
    await signIn('Sam@Example.com', mailer);
    await signIn('sam@example.com', mailer);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM operators').first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('sign out deletes the session server-side', async () => {
    const jar = await signIn('a@example.com', mailer);
    const out = await req('/logout', { method: 'POST' }, jar);
    expect(out.status).toBe(303);
    // replaying the old cookie must not work
    expect((await req('/app', {}, jar)).status).toBe(302);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('refuses cross-site form posts', async () => {
    const jar = await signIn('a@example.com', mailer);
    const res = await req('/logout', { method: 'POST', body: new URLSearchParams({}), headers: { 'content-type': 'application/x-www-form-urlencoded' } }, jar, 'https://evil.example');
    expect(res.status).toBe(403);
  });
});

describe('console access and onboarding', () => {
  it('sends anonymous visitors to sign in', async () => {
    const res = await req('/app');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('sends a new operator to onboarding, which creates brand, truck and owner membership', async () => {
    const jar = await signIn('owner@example.com', mailer);
    const first = await req('/app', {}, jar);
    expect(first.headers.get('location')).toBe('/app/onboarding');

    const done = await onboard(jar);
    expect(done.status).toBe(303);
    const dash = await req('/app', {}, jar);
    expect(dash.status).toBe(200);
    const page = await dash.text();
    expect(page).toContain('Angry Archies');
    expect(page).toContain('Big Red');

    const m = await env.DB.prepare(
      `SELECT m.role, b.slug, b.timezone FROM memberships m JOIN brands b ON b.id = m.brand_id`,
    ).first<{ role: string; slug: string; timezone: string }>();
    expect(m).toEqual({ role: 'owner', slug: 'angry-archies', timezone: 'America/New_York' });
  });

  it('derives the slug from the name when left blank', async () => {
    const jar = await signIn('o@example.com', mailer);
    await onboard(jar, { name: 'Tío’s Tacos & Más', slug: '' });
    const b = await env.DB.prepare('SELECT slug FROM brands').first<{ slug: string }>();
    expect(b!.slug).toBe('tio-s-tacos-and-mas');
  });

  it('refuses reserved, malformed, and taken slugs, and bad timezones', async () => {
    const jar = await signIn('o@example.com', mailer);
    expect((await onboard(jar, { slug: 'near-me' })).status).toBe(400);
    expect((await onboard(jar, { slug: 'Bad Slug!' })).status).toBe(400);
    expect((await onboard(jar, { timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await onboard(jar, { timezone: 'EST' })).status).toBe(400);
    expect((await onboard(jar)).status).toBe(303);

    const other = await signIn('p@example.com', mailer);
    const taken = await onboard(other);
    expect(taken.status).toBe(409);
    expect(await taken.text()).toContain('already uses that address');
  });

  it('freezes the slug once the brand is public', async () => {
    const jar = await signIn('o@example.com', mailer);
    await onboard(jar);
    await env.DB.prepare("UPDATE brands SET slug = 'renamed'").run(); // allowed before public
    await env.DB.prepare('UPDATE brands SET public_at = 1').run();
    await expect(env.DB.prepare("UPDATE brands SET slug = 'again'").run()).rejects.toThrow(/slug_immutable/);
  });
});

describe('Owner and Crew', () => {
  async function ownerWithCrew() {
    const owner = await signIn('owner@example.com', mailer);
    await onboard(owner);
    const added = await req('/app/team', form({ email: 'Crew@Example.com', role: 'crew' }), owner);
    expect(added.status).toBe(200);
    const invite = mailer.outbox.at(-1)!;
    expect(invite.to).toBe('crew@example.com');
    expect(invite.subject).toContain('Angry Archies');
    const res = await req(linkFrom(mailer), { method: 'POST' });
    return { owner, crew: cookiesFrom(res) };
  }

  it('an invited crew member signs in straight into the brand', async () => {
    const { crew } = await ownerWithCrew();
    const dash = await req('/app', {}, crew);
    expect(dash.status).toBe(200);
    expect(await dash.text()).toContain('Crew');
  });

  it('crew cannot manage the team', async () => {
    const { crew } = await ownerWithCrew();
    expect((await req('/app/team', {}, crew)).status).toBe(403);
    expect((await req('/app/team', form({ email: 'x@example.com', role: 'owner' }), crew)).status).toBe(403);
  });

  it('the last owner cannot be removed or demoted', async () => {
    const { owner } = await ownerWithCrew();
    const me = await env.DB.prepare("SELECT id FROM operators WHERE email = 'owner@example.com'").first<{ id: string }>();
    expect((await req(`/app/team/${me!.id}/remove`, form({}), owner)).status).toBe(409);
    expect((await req('/app/team', form({ email: 'owner@example.com', role: 'crew' }), owner)).status).toBe(409);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role = 'owner'").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('switching brands only works for brands you belong to', async () => {
    const { owner } = await ownerWithCrew();
    const stranger = await signIn('s@example.com', mailer);
    await onboard(stranger, { name: 'Other', slug: 'other' });
    const otherId = (await env.DB.prepare("SELECT id FROM brands WHERE slug = 'other'").first<{ id: string }>())!.id;
    const sw = await req('/app/brand', form({ brand_id: otherId }), owner);
    const page = await (await req('/app', {}, cookiesFrom(sw, owner))).text();
    expect(page).toContain('Angry Archies');
    expect(page).not.toContain('>Other<');
  });
});

it('uses the configured base origin in links', () => expect(BASE).toBe('https://rally.test'));
