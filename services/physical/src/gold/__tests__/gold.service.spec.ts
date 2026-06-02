import { NotFoundException } from '@nestjs/common';
import { GoldService } from '../gold.service';
import { GoldRepository, type GoldRow } from '../gold.repository';
import { SgbRepository, type SgbRow } from '../sgb.repository';

const mockGoldRow: GoldRow = {
  id: 'g1',
  user_id: 'u1',
  type: 'PHYSICAL',
  weight_grams: '10.0000',
  purity: 916,
  purchase_price_per_gram: '5000.0000',
  purchase_date: '2024-01-15',
  storage_location: 'Bank Locker',
  notes: null,
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

const mockSgbRow: SgbRow = {
  id: 's1',
  user_id: 'u1',
  series_name: 'SGB 2024-25 Series I',
  units: '5.0000',
  purchase_nav: '6200.0000',
  purchase_date: '2024-03-01',
  maturity_date: '2032-03-01',
  coupon_rate: '2.50',
  broker: 'Zerodha',
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2024-03-01T00:00:00Z',
};

describe('GoldService', () => {
  let service: GoldService;
  let goldRepo: jest.Mocked<GoldRepository>;
  let sgbRepo: jest.Mocked<SgbRepository>;

  beforeEach(() => {
    goldRepo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    sgbRepo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    service = new GoldService(goldRepo, sgbRepo);
  });

  describe('Gold valuation math', () => {
    it('computes invested as weightGrams * purchasePricePerGram', async () => {
      goldRepo.findAllByUser.mockResolvedValue([mockGoldRow]);
      const result = await service.listGold('u1');
      expect(result).toHaveLength(1);
      // 10 * 5000 = 50000
      expect(result[0]!.invested).toBe('50000.0000');
    });

    it('computes currentValue as weightGrams * rate24k * (purity/999) when rate available', async () => {
      service.setCurrentRate('7000.0000');
      goldRepo.findAllByUser.mockResolvedValue([mockGoldRow]);
      const result = await service.listGold('u1');
      // 10 * 7000 * (916/999) = 70000 * 0.916917... = 64184.1842 (approx)
      const expected = 10 * 7000 * (916 / 999);
      const actual = parseFloat(result[0]!.currentValue!);
      expect(actual).toBeCloseTo(expected, 2);
    });

    it('currentValue is null when no rate available', async () => {
      goldRepo.findAllByUser.mockResolvedValue([mockGoldRow]);
      const result = await service.listGold('u1');
      expect(result[0]!.currentValue).toBeNull();
    });

    it('computes 24k gold (purity=999) value correctly', async () => {
      service.setCurrentRate('7000.0000');
      const row24k: GoldRow = { ...mockGoldRow, purity: 999 };
      goldRepo.findAllByUser.mockResolvedValue([row24k]);
      const result = await service.listGold('u1');
      // 10 * 7000 * (999/999) = 70000
      const actual = parseFloat(result[0]!.currentValue!);
      expect(actual).toBeCloseTo(70000, 2);
    });
  });

  describe('SGB valuation', () => {
    it('computes invested as units * purchaseNav', async () => {
      sgbRepo.findAllByUser.mockResolvedValue([mockSgbRow]);
      const result = await service.listSgb('u1');
      expect(result).toHaveLength(1);
      // 5 * 6200 = 31000
      expect(result[0]!.invested).toBe('31000.0000');
    });
  });

  describe('error handling', () => {
    it('getGold throws NotFoundException when not found', async () => {
      goldRepo.findById.mockResolvedValue(null);
      await expect(service.getGold('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('getSgb throws NotFoundException when not found', async () => {
      sgbRepo.findById.mockResolvedValue(null);
      await expect(service.getSgb('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('removeGold throws NotFoundException when not found', async () => {
      goldRepo.delete.mockResolvedValue(false);
      await expect(service.removeGold('u1', 'x')).rejects.toThrow(NotFoundException);
    });
  });
});
