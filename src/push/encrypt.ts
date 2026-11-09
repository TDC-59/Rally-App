// RFC 8291 — Message Encryption for Web Push, aes128gcm content coding (RFC 8188).
// WebCrypto only: Node's crypto (and therefore the `web-push` package) doesn't run on Workers.

import { b64urlDecode, concat, utf8 } from '../lib/b64';

export interface PushSubscriptionKeys {
  p256dh: string; // base64url, uncompressed P-256 point (65 bytes)
  auth: string;   // base64url, 16 bytes
}

/** Fixed inputs for deterministic output. Tests only. */
export interface EncryptOverrides {
  asKeyPair?: CryptoKeyPair; // application server ephemeral ECDH key pair
  salt?: Uint8Array;
}

const RECORD_SIZE = 4096;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF with a single expand block (all outputs here are ≤ 32 bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

export async function encryptPayload(
  keys: PushSubscriptionKeys,
  plaintext: Uint8Array,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlDecode(keys.p256dh);
  const authSecret = b64urlDecode(keys.auth);
  if (uaPublicRaw.length !== 65 || uaPublicRaw[0] !== 0x04) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth secret');
  // header (86) + delimiter (1) + GCM tag (16) must fit one record
  if (plaintext.length > RECORD_SIZE - 86 - 17) throw new Error('payload too large');

  const asKeys = overrides.asKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey) as ArrayBuffer);

  const uaPublic = await crypto.subtle.importKey('raw', uaPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(// workers-types spells the WebCrypto `public` member `$public`, the runtime takes `public`
    { name: 'ECDH', public: uaPublic } as unknown as SubtleCryptoDeriveKeyAlgorithm, asKeys.privateKey, 256),
  );

  // RFC 8291 §3.4
  const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // Single, final record: plaintext followed by the 0x02 delimiter, no extra padding.
  const padded = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // RFC 8188 §2.1 header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(65)
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concat(header, ciphertext);
}
