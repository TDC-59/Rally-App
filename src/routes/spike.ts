// THROWAWAY — the iOS Web Push gate (plan step 1). Delete once real follow + push lands (step 7).
// Proves: WebCrypto VAPID + RFC 8291 from a Worker reaches a real iPhone running the page as a Home Screen app.

import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { sendPush, type Subscription } from '../push/send';
import type { VapidKeys } from '../push/vapid';
import { b64urlEncode, utf8 } from '../lib/b64';

export const spike = new Hono<{ Bindings: Env }>();

const vapid = (env: Env): VapidKeys => ({
  publicKey: env.VAPID_PUBLIC_KEY,
  privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey,
  subject: env.VAPID_SUBJECT,
});

const kvKey = async (endpoint: string) =>
  'spike:sub:' + b64urlEncode(await crypto.subtle.digest('SHA-256', utf8(endpoint)));

spike.use('*', async (c, next) => {
  if (c.env.SPIKE_ENABLED !== '1') return c.notFound();
  await next();
});

// The page must sit inside the service worker's scope (/spike/), so the canonical URL has the slash.
spike.get('/spike', (c) => c.redirect('/spike/', 301));

spike.get('/spike/', (c) =>
  c.html(html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rally push test</title>
<link rel="manifest" href="/spike/manifest.webmanifest">
<link rel="apple-touch-icon" href="/spike/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#FF4D1C">
<style>
  :root { --ground:#FFFFFF; --ink:#19120F; --ink-2:#574C47; --line:#E3DCD8; --hard:#19120F; --ember:#FF4D1C; --ember-ink:#19120F; --ok:#0E7A52; --crit:#BE123C; }
  @media (prefers-color-scheme: dark) { :root { --ground:#0A0A0A; --ink:#FAF7F6; --ink-2:#B6AAA5; --line:#332B27; --hard:#FAF7F6; --ember:#FF6236; --ember-ink:#1A0A04; --ok:#35C98A; --crit:#FF5F7A; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--ground); color:var(--ink); font:16px/1.45 system-ui, -apple-system, sans-serif; }
  main { display:grid; gap:16px; padding:24px max(16px, env(safe-area-inset-left)); max-width:560px; margin:0 auto; }
  h1 { font:900 28px/1 "Arial Black", system-ui, sans-serif; text-transform:uppercase; letter-spacing:-0.02em; margin:0; }
  button { font:inherit; font-weight:700; padding:14px 16px; border:2px solid var(--hard); border-radius:2px; background:var(--ember); color:var(--ember-ink); box-shadow:3px 3px 0 var(--hard); cursor:pointer; }
  button:active { transform:translate(3px,3px); box-shadow:none; }
  button:disabled { opacity:.5; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:0; font:14px/1.4 ui-monospace, Menlo, monospace; }
  dt { color:var(--ink-2); }
  .box { border:2px solid var(--line); border-radius:2px; padding:12px; display:grid; gap:8px; }
  #log { font:13px/1.4 ui-monospace, Menlo, monospace; white-space:pre-wrap; word-break:break-all; margin:0; }
  .row { display:flex; gap:12px; flex-wrap:wrap; }
</style>
</head>
<body>
<main>
  <h1>Rally push test</h1>
  <p>This page checks one thing: can Rally send a push to this phone?</p>
  <div class="box" id="ios-help" hidden>
    <strong>On iPhone, push only works from the Home Screen.</strong>
    <span>Tap Share, then "Add to Home Screen". Open Rally from the new icon and come back to this step.</span>
  </div>
  <dl id="diag"></dl>
  <div class="row">
    <button id="sub">1. Allow notifications</button>
  </div>
  <div class="row">
    <button id="now" disabled>2. Send a push now</button>
    <button id="later" disabled>Send in 15s (lock your phone)</button>
  </div>
  <pre id="log"></pre>
</main>
<script>
${raw(SPIKE_PAGE_JS.replace('"__VAPID__"', JSON.stringify(c.env.VAPID_PUBLIC_KEY)))}
</script>
</body>
</html>`),
);

const SPIKE_PAGE_JS = String.raw`
const VAPID = ${'"__VAPID__"'};
const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent = new Date().toLocaleTimeString() + '  ' + m + '\n' + $('log').textContent; };
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function diag() {
  const d = {
    platform: isIOS ? 'iOS/iPadOS' : 'other',
    standalone: String(standalone),
    serviceWorker: String('serviceWorker' in navigator),
    PushManager: String('PushManager' in window),
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
  };
  $('diag').innerHTML = Object.entries(d).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
  $('ios-help').hidden = !(isIOS && !standalone);
}
function urlB64ToBytes(s) {
  const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
let current = null;
async function post(path, body) {
  const t0 = performance.now();
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  log(path + ' → ' + r.status + ' ' + JSON.stringify(j) + ' (' + Math.round(performance.now() - t0) + 'ms)');
  return j;
}
async function ready() {
  if (!('serviceWorker' in navigator)) throw new Error('no service worker support');
  const reg = await navigator.serviceWorker.register('/spike/sw.js', { scope: '/spike/' });
  await navigator.serviceWorker.ready;
  return reg;
}
async function restore() {
  try {
    const reg = await ready();
    current = await reg.pushManager.getSubscription();
    if (current) { log('existing subscription found'); $('now').disabled = $('later').disabled = false; }
  } catch (e) { log('restore: ' + e.message); }
}
$('sub').onclick = async () => {
  try {
    const reg = await ready();
    // must be called from the tap itself, or iOS refuses
    const perm = await Notification.requestPermission();
    diag();
    if (perm !== 'granted') return log('permission: ' + perm);
    current = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID) });
    const host = new URL(current.endpoint).host;
    log('subscribed via ' + host);
    await post('/spike/subscribe', current.toJSON());
    $('now').disabled = $('later').disabled = false;
  } catch (e) { log('subscribe failed: ' + e.name + ': ' + e.message); }
};
$('now').onclick = () => post('/spike/send', { endpoint: current.endpoint, delay: 0 });
$('later').onclick = () => post('/spike/send', { endpoint: current.endpoint, delay: 15 });
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => log('sw: ' + JSON.stringify(e.data)));
diag(); restore();
`;

spike.get('/spike/manifest.webmanifest', (c) =>
  c.body(
    JSON.stringify({
      name: 'Rally push test',
      short_name: 'Rally test',
      start_url: '/spike/?src=pwa',
      scope: '/spike/',
      display: 'standalone',
      background_color: '#FFFFFF',
      theme_color: '#FF4D1C',
      icons: [
        { src: '/spike/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/spike/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }),
    200,
    { 'content-type': 'application/manifest+json' },
  ),
);

spike.get('/spike/sw.js', (c) =>
  c.body(
    String.raw`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'Rally', body: event.data && event.data.text() }; }
  // iOS revokes push permission from a page that receives a push without showing a notification
  event.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Rally', { body: d.body || '', tag: d.tag, data: { url: d.url || '/spike/' } });
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach((c) => c.postMessage({ received: d.title, at: new Date().toISOString() }));
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/spike/';
  event.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if (new URL(c.url).pathname.startsWith('/spike/')) { await c.focus(); return c.navigate(url); } }
    return self.clients.openWindow(url);
  })());
});
`,
    200,
    { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' },
  ),
);

spike.post('/spike/subscribe', async (c) => {
  const s = (await c.req.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!s.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) return c.json({ error: 'bad subscription' }, 400);
  const sub: Subscription = { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth };
  await c.env.CACHE.put(await kvKey(sub.endpoint), JSON.stringify(sub), { expirationTtl: 7 * 86400 });
  return c.json({ ok: true, service: new URL(sub.endpoint).host });
});

spike.post('/spike/send', async (c) => {
  const { endpoint, delay } = (await c.req.json()) as { endpoint?: string; delay?: number };
  if (!endpoint) return c.json({ error: 'no endpoint' }, 400);
  const stored = await c.env.CACHE.get(await kvKey(endpoint));
  if (!stored) return c.json({ error: 'unknown subscription — tap Allow again' }, 404);
  const sub = JSON.parse(stored) as Subscription;
  const send = async () => {
    const t0 = Date.now();
    const out = await sendPush(
      sub,
      { title: 'OPEN NOW · Test Truck', body: `Brewery lot until 2:00. Sent ${new Date().toISOString().slice(11, 19)}Z`, url: '/spike/?src=push', tag: 'spike' },
      vapid(c.env),
    );
    if (out.kind === 'gone') await c.env.CACHE.delete(await kvKey(endpoint));
    return { ...out, ms: Date.now() - t0 };
  };
  if (delay && delay > 0) {
    c.executionCtx.waitUntil((async () => {
      await new Promise((r) => setTimeout(r, Math.min(delay, 25) * 1000));
      console.log('spike delayed push', JSON.stringify(await send()));
    })());
    return c.json({ queued: true, inSeconds: Math.min(delay, 25) });
  }
  return c.json(await send());
});
