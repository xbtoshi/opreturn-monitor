import seedCollections from '../collections.json';

/**
 * Seed collections and addresses come from the project-root collections.json
 * file (single source of truth). Used by ensureSeeded(), which runs
 * automatically on the first cron run and via POST /api/admin/seed.
 */

interface SeedCollection {
  name: string;
  description: string;
  addresses: Array<{ address: string; label: string }>;
}

/**
 * Idempotent: inserts the seed collections + addresses only when the
 * collections table is empty. Safe to call on every cron run.
 */
export async function ensureSeeded(db: D1Database): Promise<void> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM collections').first<{ n: number }>();
  if ((row?.n ?? 0) > 0) return;

  for (const col of seedCollections as SeedCollection[]) {
    const res = await db
      .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
      .bind(col.name, col.description)
      .run();
    const collectionId = Number(res.meta.last_row_id);

    for (const addr of col.addresses) {
      await db
        .prepare('INSERT OR IGNORE INTO addresses (address, label, collection_id) VALUES (?, ?, ?)')
        .bind(addr.address, addr.label, collectionId)
        .run();
    }
  }
}
