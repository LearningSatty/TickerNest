import { NotFoundException } from '@nestjs/common';
import { SipService } from '../sip.service';
import { SipRepository, type SipRow } from '../sip.repository';

const mockRow: SipRow = {
  id: '1',
  user_id: 'u1',
  fund_id: null,
  fund_name: 'HDFC Flexi Cap Fund',
  scheme_code: '119551',
  amount: '5000.00',
  frequency: 'MONTHLY',
  sip_date: 5,
  start_date: '2024-01-01',
  end_date: null,
  status: 'ACTIVE',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('SipService', () => {
  let service: SipService;
  let repo: jest.Mocked<SipRepository>;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    service = new SipService(repo);
  });

  it('create delegates to repo and returns correct status', async () => {
    repo.create.mockResolvedValue(mockRow);
    const result = await service.create('u1', {
      fundName: 'HDFC Flexi Cap Fund',
      schemeCode: '119551',
      amount: '5000.00',
      frequency: 'MONTHLY',
      sipDate: 5,
      startDate: '2024-01-01',
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.fund_name).toBe('HDFC Flexi Cap Fund');
    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({ amount: '5000.00' }));
  });

  it('update throws NotFoundException when SIP not found', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('u1', 'nonexistent', { amount: '6000' })).rejects.toThrow(NotFoundException);
  });

  it('get throws NotFoundException when SIP not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('remove throws NotFoundException when SIP not found', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(service.remove('u1', 'x')).rejects.toThrow(NotFoundException);
  });
});
