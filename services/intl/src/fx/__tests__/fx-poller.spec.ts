import { FxPollerService } from '../fx-poller.service';

describe('FxPollerService', () => {
  let poller: FxPollerService;
  let db: any;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    poller = new FxPollerService(db);
  });

  it('returns zero updates when fetch fails with non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const result = await poller.pollAll();
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('updates fx_rate on successful fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { INR: 83.45 } }),
    }) as any;
    const result = await poller.pollAll();
    expect(result.updated).toBe(3); // USD/INR, EUR/INR, GBP/INR
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('counts errors when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    const result = await poller.pollAll();
    expect(result.errors).toBe(3);
    expect(result.updated).toBe(0);
  });

  it('handles partial failures gracefully', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error('timeout');
      return Promise.resolve({
        ok: true,
        json: async () => ({ rates: { INR: 83.45 } }),
      });
    }) as any;
    const result = await poller.pollAll();
    expect(result.updated).toBe(2);
    expect(result.errors).toBe(1);
  });
});
