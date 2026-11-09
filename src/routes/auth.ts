import { Hono } from 'hono';
import { html } from 'hono/html';
import { rallyPage, errorList } from '../views/layout';
import { consumeLoginToken, isPlausibleEmail, issueLoginToken, loginTokenIsLive, LOGIN_TOKEN_TTL, normalizeEmail } from '../auth/tokens';
import { createSession, destroySession, readSession } from '../auth/session';
import { upsertOperatorByEmail } from '../db/operators';
import { mailerFor, MailNotConfigured } from '../email/mailer';
import { signInEmail } from '../email/templates';

export const auth = new Hono<{ Bindings: Env }>();

const IP_LIMIT_PER_HOUR = 20;

const loginForm = (email = '', errors: Record<string, string> = {}) => html`
  <div class="stack">
    <h1>Sign in</h1>
    <p class="muted">We'll email you a link. No password.</p>
  </div>
  ${errorList(errors)}
  <form method="post" action="/login" class="card">
    <label>Email
      <input type="email" name="email" value="${email}" autocomplete="email" inputmode="email" required autofocus>
    </label>
    <button>Email me a link</button>
  </form>`;

auth.get('/login', async (c) => {
  if (await readSession(c)) return c.redirect('/app');
  return c.html(rallyPage({ title: 'Sign in', body: loginForm(), narrow: true }));
});

auth.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const email = normalizeEmail(String(form.email ?? ''));
  if (!isPlausibleEmail(email)) {
    return c.html(rallyPage({ title: 'Sign in', body: loginForm(email, { email: 'Enter a full email address, like you@yourtruck.com.' }), narrow: true }), 400);
  }

  // Per-IP ceiling (approximate: KV is eventually consistent) to stop one client mailing many addresses.
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const ipKey = `rl:login:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const ipCount = Number((await c.env.CACHE.get(ipKey)) ?? 0);

  // The page says the same thing whether or not anything was sent, so it can't be used to probe addresses.
  if (ipCount < IP_LIMIT_PER_HOUR) {
    c.executionCtx.waitUntil(c.env.CACHE.put(ipKey, String(ipCount + 1), { expirationTtl: 3700 }));
    const token = await issueLoginToken(c.env.DB, email);
    if (token) {
      const link = new URL(`/auth/${token}`, c.req.url).toString();
      try {
        await mailerFor(c.env).send(signInEmail(email, link, LOGIN_TOKEN_TTL / 60));
      } catch (e) {
        if (e instanceof MailNotConfigured) {
          return c.html(rallyPage({
            title: 'Email not set up',
            narrow: true,
            body: html`<div class="notice crit" role="alert"><strong>Rally can't send email yet</strong>
              <p>The sign-in email provider isn't configured on this deployment.</p></div>`,
          }), 503);
        }
        console.error('sign-in email failed', String(e));
        return c.html(rallyPage({
          title: 'Email failed',
          narrow: true,
          body: html`<div class="notice crit" role="alert"><strong>The email didn't send</strong>
            <p>Try again in a minute.</p></div><a class="btn secondary" href="/login">Back</a>`,
        }), 502);
      }
    }
  }

  return c.html(rallyPage({
    title: 'Check your email',
    narrow: true,
    body: html`<div class="stack">
      <h1>Check your email</h1>
      <p>If <strong>${email}</strong> can sign in, a link is on its way. It works once, for ${LOGIN_TOKEN_TTL / 60} minutes, on any device.</p>
      <p class="muted">Nothing after a minute? Check spam, or <a href="/login">try again</a>.</p>
    </div>`,
  }));
});

// GET never consumes the token: mail scanners open links before people do.
auth.get('/auth/:token', async (c) => {
  const token = c.req.param('token');
  const live = await loginTokenIsLive(c.env.DB, token);
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cache-Control', 'no-store');
  if (!live) {
    return c.html(rallyPage({
      title: 'Link expired',
      narrow: true,
      body: html`<div class="stack"><h1>That link has expired</h1>
        <p>Sign-in links work once, for ${LOGIN_TOKEN_TTL / 60} minutes.</p></div>
        <a class="btn" href="/login">Send a new link</a>`,
    }), 410);
  }
  return c.html(rallyPage({
    title: 'Sign in',
    narrow: true,
    body: html`<div class="stack"><h1>Sign in to Rally</h1></div>
      <form method="post" action="/auth/${token}"><button>Sign in</button></form>`,
  }));
});

auth.post('/auth/:token', async (c) => {
  const email = await consumeLoginToken(c.env.DB, c.req.param('token'));
  c.header('Cache-Control', 'no-store');
  if (!email) {
    return c.html(rallyPage({
      title: 'Link expired',
      narrow: true,
      body: html`<div class="stack"><h1>That link has expired</h1><p>It may already have been used.</p></div>
        <a class="btn" href="/login">Send a new link</a>`,
    }), 410);
  }
  const operatorId = await upsertOperatorByEmail(c.env.DB, email);
  await createSession(c, operatorId);
  return c.redirect('/app', 303);
});

auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/login', 303);
});
