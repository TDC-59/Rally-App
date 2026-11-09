import { nowSec } from '../lib/time';

export async function upsertOperatorByEmail(db: D1Database, email: string, now = nowSec()): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO operators (id, email, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(email) DO UPDATE SET email = email
       RETURNING id`,
    )
    .bind(crypto.randomUUID(), email, now)
    .first<{ id: string }>();
  return row!.id;
}

export async function setOperatorName(db: D1Database, id: string, name: string): Promise<void> {
  await db.prepare('UPDATE operators SET name = ?2 WHERE id = ?1').bind(id, name).run();
}
