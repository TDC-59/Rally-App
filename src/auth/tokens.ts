// Magic links. The token exists only in the email; the database stores its SHA-256.

import { randomToken, sha256 } from '../lib/crypto';
import { nowSec } from '../lib/time';

export const LOGIN_TOKEN_TTL = 15 * 60;
const MAX_PER_EMAIL_PER_HOUR = 5;

export const normalizeEmail = (e: string): string => e.trim().toLowerCase();

export function isPlausibleEmail(e: string): boolean {
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Returns a token to email, or null when this address has hit the hourly limit. */
export async function issueLoginToken(db: D1Database, email: string, now = nowSec()): Promise<string | null> {
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ?1 AND created_at > ?2')
    .bind(email, now - 3600)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_EMAIL_PER_HOUR) return null;
  const token = randomToken();
  await db
    .prepare('INSERT INTO login_tokens (token_hash, email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), email, now + LOGIN_TOKEN_TTL, now)
    .run();
  return token;
}

/** Atomically marks the token used. Returns its email, or null if unknown, expired, or already used. */
export async function consumeLoginToken(db: D1Database, token: string, now = nowSec()): Promise<string | null> {
  const row = await db
    .prepare(
      `UPDATE login_tokens SET used_at = ?2
       WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2
       RETURNING email`,
    )
    .bind(await sha256(token), now)
    .first<{ email: string }>();
  return row?.email ?? null;
}

/** Peek without consuming: lets GET /auth/:token say "expired" before anyone taps. */
export async function loginTokenIsLive(db: D1Database, token: string, now = nowSec()): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM login_tokens WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2')
    .bind(await sha256(token), now)
    .first();
  return !!row;
}
