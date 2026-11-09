import { describe, expect, it } from 'vitest';
import { encryptPayload } from '../src/push/encrypt';
import { vapidAuthorization } from '../src/push/vapid';
import { b64urlDecode, b64urlEncode, concat, utf8 } from '../src/lib/b64';

// ---- An independent user-agent-side decryptor (what the phone does), RFC 8291 + RFC 8188 ----
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  return (await hmac(await hmac(salt, ikm), concat(info, new Uint8Array([1])))).slice(0, len);
}
async function uaDecrypt(body: Uint8Array, uaKeys: CryptoKeyPair, authSecret: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16, false);
  const idlen = body[20]!;
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(ciphertext.length).toBeLessThanOrEqual(rs);

  const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey) as ArrayBuffer);
  const asPublic = await crypto.subtle.importKey('raw', asPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublic } as unknown as SubtleCryptoDeriveKeyAlgorithm, uaKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(utf8('WebPush: info\0'), uaPublicRaw, asPublicRaw), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  // strip trailing zero padding, then the 0x02 last-record delimiter
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(2);
  return padded.slice(0, end);
}

async function browserSubscription() {
  const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { uaKeys, auth, keys: { p256dh: b64urlEncode(raw), auth: b64urlEncode(auth) } };
}

describe('web push encryption (RFC 8291)', () => {
  it('produces a body the browser side can decrypt', async () => {
    const sub = await browserSubscription();
    const msg = utf8(JSON.stringify({ title: 'OPEN NOW', body: 'Brewery lot until 2:00', url: '/tacos' }));
    const body = await encryptPayload(sub.keys, msg);
    expect(body[20]).toBe(65); // keyid is the uncompressed server public key
    expect(await uaDecrypt(body, sub.uaKeys, sub.auth)).toEqual(msg);
  });

  it('round-trips many sizes, including the largest single record', async () => {
    const sub = await browserSubscription();
    for (const n of [0, 1, 15, 16, 17, 255, 1000, 3993]) {
      const pt = crypto.getRandomValues(new Uint8Array(n));
      expect(await uaDecrypt(await encryptPayload(sub.keys, pt), sub.uaKeys, sub.auth)).toEqual(pt);
    }
  });

  it('is deterministic given fixed server key and salt, and random otherwise', async () => {
    const sub = await browserSubscription();
    const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const salt = new Uint8Array(16).fill(7);
    const pt = utf8('When I grow up, I want to be a watermelon');
    const a = await encryptPayload(sub.keys, pt, { asKeyPair, salt });
    const b = await encryptPayload(sub.keys, pt, { asKeyPair, salt });
    expect(a).toEqual(b);
    expect(a.slice(0, 16)).toEqual(salt);
    const c = await encryptPayload(sub.keys, pt);
    expect(c.slice(0, 16)).not.toEqual(a.slice(0, 16));
  });

  it('fails on a wrong auth secret (GCM tag mismatch)', async () => {
    const sub = await browserSubscription();
    const body = await encryptPayload(sub.keys, utf8('hi'));
    await expect(uaDecrypt(body, sub.uaKeys, new Uint8Array(16))).rejects.toThrow();
  });

  it('rejects malformed subscription keys and oversize payloads', async () => {
    const sub = await browserSubscription();
    await expect(encryptPayload({ ...sub.keys, auth: 'AAAA' }, utf8('x'))).rejects.toThrow('bad auth');
    await expect(encryptPayload({ ...sub.keys, p256dh: 'AAAA' }, utf8('x'))).rejects.toThrow('bad p256dh');
    await expect(encryptPayload(sub.keys, new Uint8Array(3994))).rejects.toThrow('too large');
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs an ES256 JWT for the endpoint origin that verifies against the public key', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey;
    const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer);
    const now = 1_800_000_000;
    const auth = await vapidAuthorization(
      'https://web.push.apple.com/QGuQyavXutnMH2ZhQ...',
      { publicKey, privateJwk, subject: 'https://rally.example' },
      now,
    );
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth);
    expect(m).not.toBeNull();
    const [, h, p, s, k] = m!;
    expect(k).toBe(publicKey);
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p!)));
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: now + 43200, sub: 'https://rally.example' });
    expect(b64urlDecode(s!).length).toBe(64); // raw r||s, not DER
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64urlDecode(s!), utf8(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
