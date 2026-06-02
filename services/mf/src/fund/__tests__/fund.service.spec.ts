import { NotFoundException } from '@nestjs/common';
import { FundService } from '../fund.service';
import { FundRepository, type FundRow } from '../fund.repository';

const mockRow: FundRow = {
  id: '1',
  user_id: 'u1',
  scheme_code: '119551',
  fund_name: 'HDFC Flexi Cap Fund',
  amc: 'HDFC',
  category: 'EQUITY',
  goal: 'wealth',
  units: '100.500000',
  avg_nav: '25.5000',
  current_nav: '30.0000',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('FundService', () => {
  let service: FundService;
  let repo: jest.Mocked<FundRepository>;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    service = new FundService(repo);
  });

  it('list returns fund views with computed P/L', async () => {
    repo.findAllByUser.mockResolvedValue([mockRow]);
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    const fund = result[0]!;
    expect(fund.invested).toBe('2562.7500');       // 100.5 * 25.5
    expect(fund.currentValue).toBe('3015.0000');   // 100.5 * 30
    expect(fund.pl).toBe('452.2500');              // 3015 - 2562.75
    expect(fund.plPct).toBeCloseTo(17.64, 1);
  });

  it('list returns null P/L when no current NAV', async () => {
    repo.findAllByUser.mockResolvedValue([{ ...mockRow, current_nav: null }]);
    const result = await service.list('u1');
    expect(result[0]!.currentValue).toBeNull();
    expect(result[0]!.pl).toBeNull();
    expect(result[0]!.plPct).toBeNull();
  });

  it('get throws NotFoundException when fund not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('create calls repo.upsert and returns view', async () => {
    repo.upsert.mockResolvedValue(mockRow);
    const result = await service.create('u1', {
      schemeCode: '119551',
      fundName: 'HDFC Flexi Cap Fund',
      units: '100.5',
      avgNav: '25.5',
    });
    expect(result.schemeCode).toBe('119551');
    expect(result.invested).toBe('2562.7500');
    expect(repo.upsert).toHaveBeenCalledWith('u1', expect.objectContaining({ schemeCode: '119551' }));
  });

  it('remove throws NotFoundException when fund not found', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(service.remove('u1', 'x')).rejects.toThrow(NotFoundException);
  });
});
