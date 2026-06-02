import { GatewayService } from '../gateway.service';

describe('GatewayService', () => {
  let svc: GatewayService;

  beforeEach(() => {
    const cfg = {
      get: (k: string) => {
        const map: Record<string, string> = {
          MF_SERVICE_URL: 'http://mf',
          INTL_SERVICE_URL: 'http://intl',
          PHYSICAL_SERVICE_URL: 'http://phys',
        };
        return map[k];
      },
    } as any;
    svc = new GatewayService(cfg);
  });

  it('aggregates all service summaries', async () => {
    const mockSummary = (invested: string) => ({
      ok: true,
      json: async () => ({ totalInvested: invested, currentValue: invested, totalPL: '0', plPct: 0, asOf: '', breakdown: {} }),
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce(mockSummary('100000'))
      .mockResolvedValueOnce(mockSummary('50000'))
      .mockResolvedValueOnce(mockSummary('25000')) as any;

    const result = await svc.getNetWorth('u1', 'tok');
    expect(result.total.invested).toBe('175000.0000');
    expect(result.degraded).toBe(false);
  });

  it('handles partial failure gracefully', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalInvested: '100000', currentValue: '110000', totalPL: '10000', plPct: 10, asOf: '', breakdown: {} }) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalInvested: '50000', currentValue: '55000', totalPL: '5000', plPct: 10, asOf: '', breakdown: {} }) }) as any;

    const result = await svc.getNetWorth('u1', 'tok');
    expect(result.degraded).toBe(true);
    expect(result.total.invested).toBe('150000.0000');
    expect(result.international).toBeNull();
  });
});
