import seedCollections from '../collections.json';

/**
 * Seed collections and addresses come from the project-root collections.json
 * file (single source of truth). Used by ensureSeeded(), which runs
 * automatically on every cron run and via POST /api/admin/seed.
 *
 * Idempotent sync: creates any missing collections and inserts any missing
 * addresses, and refreshes name/description/slug on existing collections. It
 * never deletes rows, so removing an address from collections.json does not
 * unpublish archived messages — it only stops new monitoring.
 */

interface SeedCollection {
  name: string;
  description: string;
  slug?: string;
  addresses: Array<{ address: string; label: string }>;
}

/** Derive a URL-safe slug from a collection name when no explicit one is given. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export async function ensureSeeded(db: D1Database): Promise<void> {
  for (const col of seedCollections as SeedCollection[]) {
    const existing = await db
      .prepare('SELECT id FROM collections WHERE slug = ?1 OR name = ?2 LIMIT 1')
      .bind(col.slug || slugify(col.name), col.name)
      .first<{ id: number }>();

    let collectionId: number;
    if (existing) {
      collectionId = existing.id;
      await db
        .prepare('UPDATE collections SET name = ?, description = ?, slug = ? WHERE id = ?')
        .bind(col.name, col.description, col.slug || slugify(col.name), collectionId)
        .run();
    } else {
      const res = await db
        .prepare('INSERT INTO collections (name, description, slug) VALUES (?, ?, ?)')
        .bind(col.name, col.description, col.slug || slugify(col.name))
        .run();
      collectionId = Number(res.meta.last_row_id);
    }

    for (const addr of col.addresses) {
      await db
        .prepare('INSERT OR IGNORE INTO addresses (address, label, collection_id) VALUES (?, ?, ?)')
        .bind(addr.address, addr.label, collectionId)
        .run();
    }
  }
}
