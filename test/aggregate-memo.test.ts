import { beforeEach, describe, expect, it } from 'vitest';
import { clearAggregateMemo, listCategories } from '../src/db';

/**
 * Minimal D1 stand-in: agg_cache statements hit an in-memory table, anything
 * else is the aggregate query (counted, optionally failing the next one).
 */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const state = { queries: 0, failNext: false, cache: new Map<string, { value: string; at: number }>() };
  const db = {
    prepare: (sql: string) => {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => {
          args = a;
          return stmt;
        },
        first: async () => (sql.includes('agg_cache') ? state.cache.get(String(args[0])) ?? null : null),
        run: async () => {
          if (sql.startsWith('INSERT')) state.cache.set(String(args[0]), { value: String(args[1]), at: Number(args[2]) });
          if (sql.startsWith('DELETE')) state.cache.delete(String(args[0]));
          return { meta: { changes: 1 } };
        },
        all: async () => {
          state.queries++;
          if (state.failNext) {
            state.failNext = false;
            throw new Error('D1 down');
          }
          return { results: rows };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, state };
}

describe('aggregate memo', () => {
  beforeEach(() => clearAggregateMemo());

  it('shares one query between concurrent and repeat callers', async () => {
    const { db, state } = fakeDb([{ category: 'love', count: 3, last_ts: 1 }]);
    const [a, b] = await Promise.all([listCategories(db), listCategories(db)]);
    await listCategories(db);
    expect(state.queries).toBe(1);
    expect(a).toEqual([{ category: 'love', count: 3, last_ts: 1 }]);
    expect(b).toBe(a);
  });

  it('serves a cold isolate from agg_cache without recomputing', async () => {
    const { db, state } = fakeDb([{ category: 'love', count: 3, last_ts: 1 }]);
    await listCategories(db);
    clearAggregateMemo(); // a fresh isolate
    expect(await listCategories(db)).toEqual([{ category: 'love', count: 3, last_ts: 1 }]);
    expect(state.queries).toBe(1);
  });

  it('recomputes once the stored row is past its TTL', async () => {
    const { db, state } = fakeDb([]);
    state.cache.set('categories', { value: '[]', at: Date.now() - 301_000 });
    await listCategories(db);
    expect(state.queries).toBe(1);
  });

  it('does not cache failures', async () => {
    const { db, state } = fakeDb([]);
    state.failNext = true;
    await expect(listCategories(db)).rejects.toThrow('D1 down');
    await expect(listCategories(db)).resolves.toEqual([]);
    expect(state.queries).toBe(2);
  });
});
