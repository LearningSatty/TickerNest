import { Injectable, NotFoundException } from '@nestjs/common';
import { UlipRepository, type UlipRow } from './ulip.repository';
import type { CreateUlipInput, UpdateUlipInput } from './ulip.dto';

@Injectable()
export class UlipService {
  constructor(private readonly repo: UlipRepository) {}

  async list(userId: string): Promise<UlipRow[]> {
    return this.repo.findAllByUser(userId);
  }

  async get(userId: string, id: string): Promise<UlipRow> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('ULIP not found');
    return row;
  }

  async create(userId: string, input: CreateUlipInput): Promise<UlipRow> {
    return this.repo.create(userId, input);
  }

  async update(userId: string, id: string, input: UpdateUlipInput): Promise<UlipRow> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('ULIP not found');
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('ULIP not found');
  }
}
