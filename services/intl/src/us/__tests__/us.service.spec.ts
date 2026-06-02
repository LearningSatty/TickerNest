import { NotFoundException } from '@nestjs/common';
import { UsService } from '../us.service';
import { UsRepository, type UsHoldingRow } from '../us.repository';

const mockRow: UsHoldingRow = {
  id: '1',
  user_id: 'u1',
  ticker: 'AAPL',
  name: 'Apple Inc',
  sector: 'Technology',
  qty: '10.000000',
  avg_cost_usd: '150.5000',
  lot_kind: 'OPEN_MARKET',
  broker_name: 'IBKR',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('UsService', () => {
  let service: UsService;
  let repo: jest.Mocked<UsRepository>;
  let db: any;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    db = { query: jest.fn() };
    service = new UsService(repo, db);
  });

  it('list returns holdings with computed investedUsd and investedInr', async () => {
    repo.findAllByUser.mockResolvedValue([mockRow]);
    db.query.mockResolvedValue({ rows: [{ rate: '83.5000' }] });

    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    const h = result[0]!;
    expect(h.investedUsd).toBe('1505.0000');        // 10 * 150.5
    expect(h.investedInr).toBe('125667.5000');      // 1505 * 83.5
    expect(h.fxRate).toBe('83.5000');
  });

  it('list returns null investedInr when no fx rate available', async () => {
    repo.findAllByUser.mockResolvedValue([mockRow]);
    db.query.mockResolvedValue({ rows: [] });

    const result = await service.list('u1');
    expect(result[0]!.investedInr).toBeNull();
    expect(result[0]!.fxRate).toBeNull();
  });

  it('get throws NotFoundException when holding not found', async () => {
    repo.findById.mockResolvedValue(null);
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('create calls repo.create and returns view', async () => {
    repo.create.mockResolvedValue(mockRow);
    db.query.mockResolvedValue({ rows: [{ rate: '83.5000' }] });

    const result = await service.create('u1', {
      ticker: 'AAPL',
      qty: '10',
      avgCostUsd: '150.5',
      lotKind: 'OPEN_MARKET',
    });
    expect(result.ticker).toBe('AAPL');
    expect(result.investedUsd).toBe('1505.0000');
    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({ ticker: 'AAPL' }));
  });

  it('remove throws NotFoundException when holding not found', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(service.remove('u1', 'x')).rejects.toThrow(NotFoundException);
  });
});
