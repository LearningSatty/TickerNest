import { NotFoundException } from '@nestjs/common';
import { CryptoService } from '../crypto.service';
import { CryptoRepository, type CryptoHoldingRow } from '../crypto.repository';

const mockRow: CryptoHoldingRow = {
  id: '1',
  user_id: 'u1',
  coin: 'BTC',
  name: 'Bitcoin',
  qty: '0.50000000',
  avg_cost_inr: '4500000.0000',
  platform: 'WazirX',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('CryptoService', () => {
  let service: CryptoService;
  let repo: jest.Mocked<CryptoRepository>;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    service = new CryptoService(repo);
  });

  it('list returns holdings with computed investedInr', async () => {
    repo.findAllByUser.mockResolvedValue([mockRow]);
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    const h = result[0]!;
    expect(h.investedInr).toBe('2250000.0000'); // 0.5 * 4500000
  });

  it('get throws NotFoundException when holding not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('create calls repo.create and returns view with invested', async () => {
    repo.create.mockResolvedValue(mockRow);
    const result = await service.create('u1', {
      coin: 'BTC',
      qty: '0.5',
      avgCostInr: '4500000',
    });
    expect(result.coin).toBe('BTC');
    expect(result.investedInr).toBe('2250000.0000');
    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({ coin: 'BTC' }));
  });

  it('remove throws NotFoundException when holding not found', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(service.remove('u1', 'x')).rejects.toThrow(NotFoundException);
  });

  it('computes invested correctly for fractional quantities', async () => {
    const row: CryptoHoldingRow = {
      ...mockRow,
      qty: '1.25000000',
      avg_cost_inr: '200.0000',
    };
    repo.findAllByUser.mockResolvedValue([row]);
    const result = await service.list('u1');
    expect(result[0]!.investedInr).toBe('250.0000'); // 1.25 * 200
  });
});
