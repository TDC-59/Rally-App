import { nowSec } from '../lib/time';

export type Role = 'owner' | 'crew';

export interface BrandMembership {
  brand_id: string;
  slug: string;
  name: string;
  timezone: string;
  role: Role;
}

export async function membershipsFor(db: D1Database, operatorId: string): Promise<BrandMembership[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id AS brand_id, b.slug, b.name, b.timezone, m.role
       FROM memberships m JOIN brands b ON b.id = m.brand_id
       WHERE m.operator_id = ?1
       ORDER BY b.name COLLATE NOCASE`,
    )
    .bind(operatorId)
    .all<BrandMembership>();
  return results;
}

export class SlugTaken extends Error {}

/** Brand, its first truck, and the creator as Owner, in one atomic batch. */
export async function createBrand(
  db: D1Database,
  input: { name: string; slug: string; timezone: string; truckName: string; operatorId: string },
  now = nowSec(),
): Promise<{ brandId: string; truckId: string }> {
  const brandId = crypto.randomUUID();
  const truckId = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare('INSERT INTO brands (id, slug, name, timezone, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(brandId, input.slug, input.name, input.timezone, now),
      db.prepare('INSERT INTO trucks (id, brand_id, name, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(truckId, brandId, input.truckName, now),
      db.prepare("INSERT INTO memberships (brand_id, operator_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)")
        .bind(brandId, input.operatorId, now),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE') && String(e).includes('brands.slug')) throw new SlugTaken();
    throw e;
  }
  return { brandId, truckId };
}

export async function trucksFor(db: D1Database, brandId: string) {
  const { results } = await db
    .prepare('SELECT id, name FROM trucks WHERE brand_id = ?1 AND archived_at IS NULL ORDER BY created_at')
    .bind(brandId)
    .all<{ id: string; name: string }>();
  return results;
}

export interface Member {
  operator_id: string;
  email: string;
  name: string | null;
  role: Role;
}

export async function membersOf(db: D1Database, brandId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id AS operator_id, o.email, o.name, m.role
       FROM memberships m JOIN operators o ON o.id = m.operator_id
       WHERE m.brand_id = ?1
       ORDER BY m.role DESC, o.email`,
    )
    .bind(brandId)
    .all<Member>();
  return results;
}

/** Adds or changes a member's role. Returns false if that would leave the brand without an owner. */
export async function setMembership(db: D1Database, brandId: string, operatorId: string, role: Role, now = nowSec()): Promise<boolean> {
  if (role === 'crew' && !(await hasAnotherOwner(db, brandId, operatorId))) return false;
  await db
    .prepare(
      `INSERT INTO memberships (brand_id, operator_id, role, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(brand_id, operator_id) DO UPDATE SET role = excluded.role`,
    )
    .bind(brandId, operatorId, role, now)
    .run();
  return true;
}

/** Returns false if the member is the brand's last owner. */
export async function removeMember(db: D1Database, brandId: string, operatorId: string): Promise<boolean> {
  if (!(await hasAnotherOwner(db, brandId, operatorId))) return false;
  await db.prepare('DELETE FROM memberships WHERE brand_id = ?1 AND operator_id = ?2').bind(brandId, operatorId).run();
  return true;
}

async function hasAnotherOwner(db: D1Database, brandId: string, operatorId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM memberships WHERE brand_id = ?1 AND role = 'owner' AND operator_id <> ?2")
    .bind(brandId, operatorId)
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}
