import { z } from 'zod';

const NumStr = z.string().regex(/^-?\d+(\.\d+)?$/, 'expected numeric string');

/** PUT /holdings/:brokerId/:ticker — manual edit. */
export const UpsertHoldingDto = z.object({
  qty: NumStr,
  avgCost: NumStr,
  /** Optional sell-side metadata when qty decreases. */
  soldPrice: NumStr.optional(),
  reason: z.string().max(500).optional(),
  mistake: z.string().max(500).optional(),
});
export type UpsertHoldingDto = z.infer<typeof UpsertHoldingDto>;
