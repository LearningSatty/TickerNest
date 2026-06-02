import { NavPollerService } from '../nav-poller.service';

describe('NavPollerService', () => {
  let poller: NavPollerService;
  let db: any;

  beforeEach(() => {
    db = { query: jest.fn() };
    poller = new NavPollerService(db);
  });

  it('returns zero updates when fetch fails', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ scheme_code: '119551' }] });
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const result = await poller.pollAll();
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0); // not ok = skip, not error
  });

  it('updates fund and nav_history on successful fetch', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ scheme_code: '119551' }] });
    db.query.mockResolvedValue({ rows: [] }); // UPDATE and INSERT
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ nav: '45.6700' }] }),
    }) as any;
    const result = await poller.pollAll();
    expect(result.updated).toBe(1);
    expect(db.query).toHaveBeenCalledTimes(3); // SELECT + UPDATE + INSERT
  });

  it('counts errors when fetch throws', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ scheme_code: '119551' }] });
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    const result = await poller.pollAll();
    expect(result.errors).toBe(1);
    expect(result.updated).toBe(0);
  });
});
