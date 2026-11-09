import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import { MemoryMailer, setMailerForTests } from '../src/email/mailer';

export const BASE = 'https://rally.test';

export function freshMailer(): MemoryMailer {
  const m = new MemoryMailer();
  setMailerForTests(m);
  return m;
}

export async function req(path: string, init: RequestInit = {}, cookie?: string, origin = BASE): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set('cookie', cookie);
  if (init.method && init.method !== 'GET') headers.set('origin', origin);
  const ctx = createExecutionContext();
  const res = await app.request(BASE + path, { ...init, headers, redirect: 'manual' }, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  body: new URLSearchParams(fields),
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
});

/** name=value pairs from Set-Cookie, ready to send back. */
export function cookiesFrom(res: Response, jar = ''): string {
  const map = new Map(jar.split('; ').filter(Boolean).map((kv) => kv.split('=', 2) as [string, string]));
  for (const sc of res.headers.getSetCookie()) {
    const [kv] = sc.split(';');
    const [k, v] = kv!.split('=', 2) as [string, string];
    if (/max-age=0/i.test(sc) || v === '') map.delete(k); else map.set(k, v);
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ');
}

export function linkFrom(mailer: MemoryMailer): string {
  const msg = mailer.outbox.at(-1);
  if (!msg) throw new Error('no email sent');
  const m = /https:\/\/rally\.test(\/auth\/[A-Za-z0-9_-]+)/.exec(msg.text);
  if (!m) throw new Error('no link in email');
  return m[1]!;
}

/** Full magic-link sign-in. Returns the session cookie jar. */
export async function signIn(email: string, mailer = freshMailer()): Promise<string> {
  await req('/login', form({ email }));
  const res = await req(linkFrom(mailer), { method: 'POST' });
  if (res.status !== 303) throw new Error(`sign-in failed: ${res.status}`);
  return cookiesFrom(res);
}

export async function onboard(cookie: string, fields: Partial<Record<'name' | 'slug' | 'timezone' | 'truck', string>> = {}) {
  return req('/app/onboarding', form({ name: 'Angry Archies', slug: 'angry-archies', timezone: 'America/New_York', truck: 'Big Red', ...fields }), cookie);
}
