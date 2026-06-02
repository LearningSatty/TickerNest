import { z } from 'zod';

export const CreateUsHoldingDto = z.object({
  ticker: z.string().min(1),
  name: z.string().optional(),
  sector: z.string().optional(),
  qty: z.string().regex(/^\d+(\.\d+)?$/),
  avgCostUsd: z.string().regex(/^\d+(\.\d+)?$/),
  lotKind: z.enum(['OPEN_MARKET', 'ESPP', 'RSU', 'BONUS']),
  brokerName: z.string().optional(),
});

export const UpdateUsHoldingDto = z.object({
  qty: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgCostUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  name: z.string().optional(),
});

export type CreateUsHoldingInput = z.infer<typeof CreateUsHoldingDto>;
export type UpdateUsHoldingInput = z.infer<typeof UpdateUsHoldingDto>;
