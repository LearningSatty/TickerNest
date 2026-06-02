import { z } from 'zod';

export const CreateSipDto = z.object({
  fundName: z.string().min(1),
  schemeCode: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  frequency: z.enum(['MONTHLY', 'WEEKLY', 'QUARTERLY']).default('MONTHLY'),
  sipDate: z.number().int().min(1).max(28).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
});

export const UpdateSipDto = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  endDate: z.string().optional(),
});

export type CreateSipInput = z.infer<typeof CreateSipDto>;
export type UpdateSipInput = z.infer<typeof UpdateSipDto>;
