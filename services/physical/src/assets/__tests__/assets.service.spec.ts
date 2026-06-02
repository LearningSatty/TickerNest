import { NotFoundException } from '@nestjs/common';
import { AssetsService } from '../assets.service';
import { AssetsRepository, type AssetRow, type EventRow } from '../assets.repository';

const mockAssetRow: AssetRow = {
  id: 'a1',
  user_id: 'u1',
  type: 'PPF',
  name: 'PPF Account',
  institution: 'SBI',
  invested: '100000.0000',
  current_value: '120000.0000',
  interest_rate: '7.10',
  maturity_date: '2039-04-01',
  nominee: 'Spouse',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
};

const mockEventRow: EventRow = {
  id: 'e1',
  user_id: 'u1',
  asset_id: 'a1',
  type: 'DEPOSIT',
  amount: '50000.0000',
  event_date: '2024-06-01',
  notes: 'Annual deposit',
  created_at: '2024-06-01T00:00:00Z',
};

describe('AssetsService', () => {
  let service: AssetsService;
  let repo: jest.Mocked<AssetsRepository>;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateValues: jest.fn(),
      delete: jest.fn(),
      createEvent: jest.fn(),
      findEventsByAsset: jest.fn(),
    } as any;
    service = new AssetsService(repo);
  });

  it('list returns asset views', async () => {
    repo.findAllByUser.mockResolvedValue([mockAssetRow]);
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('PPF Account');
    expect(result[0]!.invested).toBe('100000.0000');
    expect(result[0]!.currentValue).toBe('120000.0000');
  });

  it('get throws NotFoundException when not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  describe('addEvent', () => {
    it('DEPOSIT event increases currentValue', async () => {
      repo.findById.mockResolvedValue(mockAssetRow);
      repo.createEvent.mockResolvedValue(mockEventRow);
      repo.updateValues.mockResolvedValue(undefined);

      await service.addEvent('u1', 'a1', {
        type: 'DEPOSIT',
        amount: '50000',
        eventDate: '2024-06-01',
        notes: 'Annual deposit',
      });

      // currentValue was 120000, deposit 50000 => 170000
      expect(repo.updateValues).toHaveBeenCalledWith(
        'u1', 'a1', '100000.0000', '170000.0000',
      );
    });

    it('WITHDRAWAL event decreases currentValue', async () => {
      repo.findById.mockResolvedValue(mockAssetRow);
      repo.createEvent.mockResolvedValue({ ...mockEventRow, type: 'WITHDRAWAL' });
      repo.updateValues.mockResolvedValue(undefined);

      await service.addEvent('u1', 'a1', {
        type: 'WITHDRAWAL',
        amount: '20000',
        eventDate: '2024-06-01',
      });

      // currentValue was 120000, withdrawal 20000 => 100000
      expect(repo.updateValues).toHaveBeenCalledWith(
        'u1', 'a1', '100000.0000', '100000.0000',
      );
    });

    it('INTEREST event increases currentValue', async () => {
      repo.findById.mockResolvedValue(mockAssetRow);
      repo.createEvent.mockResolvedValue({ ...mockEventRow, type: 'INTEREST' });
      repo.updateValues.mockResolvedValue(undefined);

      await service.addEvent('u1', 'a1', {
        type: 'INTEREST',
        amount: '8520',
        eventDate: '2024-03-31',
      });

      // currentValue was 120000, interest 8520 => 128520
      expect(repo.updateValues).toHaveBeenCalledWith(
        'u1', 'a1', '100000.0000', '128520.0000',
      );
    });

    it('PREMIUM event increases invested', async () => {
      repo.findById.mockResolvedValue(mockAssetRow);
      repo.createEvent.mockResolvedValue({ ...mockEventRow, type: 'PREMIUM' });
      repo.updateValues.mockResolvedValue(undefined);

      await service.addEvent('u1', 'a1', {
        type: 'PREMIUM',
        amount: '25000',
        eventDate: '2024-04-01',
      });

      // invested was 100000, premium 25000 => 125000; currentValue unchanged
      expect(repo.updateValues).toHaveBeenCalledWith(
        'u1', 'a1', '125000.0000', '120000.0000',
      );
    });

    it('MATURITY event does not auto-update values', async () => {
      repo.findById.mockResolvedValue(mockAssetRow);
      repo.createEvent.mockResolvedValue({ ...mockEventRow, type: 'MATURITY' });
      repo.updateValues.mockResolvedValue(undefined);

      await service.addEvent('u1', 'a1', {
        type: 'MATURITY',
        amount: '200000',
        eventDate: '2039-04-01',
      });

      // Neither invested nor currentValue changed
      expect(repo.updateValues).toHaveBeenCalledWith(
        'u1', 'a1', '100000.0000', '120000.0000',
      );
    });

    it('addEvent throws NotFoundException when asset not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.addEvent('u1', 'nonexistent', { type: 'DEPOSIT', amount: '1000', eventDate: '2024-01-01' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('remove throws NotFoundException when asset not found', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(service.remove('u1', 'x')).rejects.toThrow(NotFoundException);
  });
});
