// Sessions: the cookie holds 256 random bits; the table holds their SHA-256.
// An opaque random id checked against the database needs no signature: there is nothing to forge.

import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomToken, sha256 } from '../lib/crypto';
import { nowSec } from '../lib/time';

export const SESSION_COOKIE = '__Host-rally_s';
export const SESSION_TTL = 30 * 86400;
const SLIDE_AFTER = 86400;

export interface Operator {
  id: string;
  email: string;
  name: string | null;
}

export async function createSession<E extends { Bindings: Env }>(c: Context<E>, operatorId: string, now = nowSec()): Promise<void> {
  const id = randomToken();
  await c.env.DB
    .prepare('INSERT INTO sessions (id_hash, operator_id, expires_at, last_seen_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4)')
    .bind(await sha256(id), operatorId, now + SESSION_TTL, now)
    .run();
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export async function readSession<E extends { Bindings: Env }>(c: Context<E>, now = nowSec()): Promise<Operator | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const hash = await sha256(id);
  const row = await c.env.DB
    .prepare(
      `SELECT o.id, o.email, o.name, s.last_seen_at
       FROM sessions s JOIN operators o ON o.id = s.operator_id
       WHERE s.id_hash = ?1 AND s.expires_at > ?2`,
    )
    .bind(hash, now)
    .first<Operator & { last_seen_at: number }>();
  if (!row) return null;
  if (now - row.last_seen_at > SLIDE_AFTER) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE sessions SET last_seen_at = ?2, expires_at = ?3 WHERE id_hash = ?1')
        .bind(hash, now, now + SESSION_TTL)
        .run(),
    );
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function destroySession<E extends { Bindings: Env }>(c: Context<E>): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?1').bind(await sha256(id)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}
