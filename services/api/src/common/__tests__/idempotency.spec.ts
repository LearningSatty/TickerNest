import { IdempotencyService, IdempotencyStore } from '../idempotency';

class InMemoryStore implements IdempotencyStore {
  private map = new Map<string, string>();
  private k(u: string, k: string) {
    return `${u}::${k}`;
  }
  async lookup(userId: string, key: string) {
    const v = this.map.get(this.k(userId, key));
    return v ? { recordId: v } : null;
  }
  async record(
    userId: string,
    key: string,
    recordId: string,
    _endpoint: string,
    _tx: unknown,
  ) {
    this.map.set(this.k(userId, key), recordId);
  }
}

describe('IdempotencyService', () => {
  it('first call with a fresh key → NEW', async () => {
    const svc = new IdempotencyService(new InMemoryStore());
    expect((await svc.resolve('u1', 'k1')).status).toBe('NEW');
  });

  it('after recording, the same key → REPLAY with prior recordId', async () => {
    const store = new InMemoryStore();
    await store.record('u1', 'k1', 'H-100', 'PUT /holdings', null as never);
    const svc = new IdempotencyService(store);
    expect(await svc.resolve('u1', 'k1')).toEqual({
      status: 'REPLAY',
      recordId: 'H-100',
    });
  });

  it('isolates different users with the same key', async () => {
    const store = new InMemoryStore();
    await store.record('u1', 'shared', 'H-A', 'PUT /holdings', null as never);
    const svc = new IdempotencyService(store);
    expect((await svc.resolve('u2', 'shared')).status).toBe('NEW');
    expect(await svc.resolve('u1', 'shared')).toEqual({
      status: 'REPLAY',
      recordId: 'H-A',
    });
  });
});
