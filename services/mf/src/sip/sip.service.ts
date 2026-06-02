import { Injectable, NotFoundException } from '@nestjs/common';
import { SipRepository, type SipRow } from './sip.repository';
import type { CreateSipInput, UpdateSipInput } from './sip.dto';

@Injectable()
export class SipService {
  constructor(private readonly repo: SipRepository) {}

  async list(userId: string): Promise<SipRow[]> {
    return this.repo.findAllByUser(userId);
  }

  async get(userId: string, id: string): Promise<SipRow> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('SIP not found');
    return row;
  }

  async create(userId: string, input: CreateSipInput): Promise<SipRow> {
    return this.repo.create(userId, input);
  }

  async update(userId: string, id: string, input: UpdateSipInput): Promise<SipRow> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('SIP not found');
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('SIP not found');
  }
}
