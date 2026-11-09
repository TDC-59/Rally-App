// RFC 8292 — VAPID. An ES256-signed JWT identifies Rally to the push service.

import { b64urlEncode, utf8 } from '../lib/b64';

export interface VapidKeys {
  publicKey: string;     // base64url uncompressed point; also the browser's applicationServerKey
  privateJwk: JsonWebKey; // EC P-256 JWK with d
  subject: string;       // mailto: or https: contact (Apple rejects anything else)
}

const keyCache = new Map<string, CryptoKey>();

async function signingKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const id = jwk.d ?? '';
  let k = keyCache.get(id);
  if (!k) {
    k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    keyCache.set(id, k);
  }
  return k;
}

/** Authorization header value for a push to `endpoint`. `now` in unix seconds. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // 12h: well under the 24h maximum push services accept
  const payload = b64urlEncode(utf8(JSON.stringify({ aud, exp: now + 12 * 3600, sub: keys.subject })));
  const input = `${header}.${payload}`;
  // WebCrypto ECDSA returns IEEE P1363 (r||s), which is exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys.privateJwk), utf8(input));
  return `vapid t=${input}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}
