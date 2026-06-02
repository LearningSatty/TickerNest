import { z } from 'zod';

export const CreateCryptoDto = z.object({
  coin: z.string().min(1),
  name: z.string().optional(),
  qty: z.string().regex(/^\d+(\.\d+)?$/),
  avgCostInr: z.string().regex(/^\d+(\.\d+)?$/),
  platform: z.string().optional(),
});

export const UpdateCryptoDto = z.object({
  qty: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgCostInr: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export type CreateCryptoInput = z.infer<typeof CreateCryptoDto>;
export type UpdateCryptoInput = z.infer<typeof UpdateCryptoDto>;
