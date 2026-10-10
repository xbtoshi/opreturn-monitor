import { beforeEach, describe, expect, it } from 'vitest';
import { clearAggregateMemo, listCategories } from '../src/db';

/** Minimal D1 stand-in: counts queries, optionally failing the next one. */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const state = { queries: 0, failNext: false };
  const db = {
    prepare: () => ({
      all: async () => {
        state.queries++;
        if (state.failNext) {
          state.failNext = false;
          throw new Error('D1 down');
        }
        return { results: rows };
      },
    }),
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

  it('does not cache failures', async () => {
    const { db, state } = fakeDb([]);
    state.failNext = true;
    await expect(listCategories(db)).rejects.toThrow('D1 down');
    await expect(listCategories(db)).resolves.toEqual([]);
    expect(state.queries).toBe(2);
  });

  it('reloads after clearAggregateMemo', async () => {
    const { db, state } = fakeDb([]);
    await listCategories(db);
    clearAggregateMemo('categories');
    await listCategories(db);
    expect(state.queries).toBe(2);
  });
});
