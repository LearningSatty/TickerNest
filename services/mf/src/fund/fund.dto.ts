import { z } from 'zod';

export const CreateFundDto = z.object({
  schemeCode: z.string().min(1),
  fundName: z.string().min(1),
  amc: z.string().optional(),
  category: z.enum(['EQUITY', 'DEBT', 'HYBRID', 'ELSS', 'LIQUID', 'INDEX', 'OTHER']).optional(),
  goal: z.string().optional(),
  units: z.string().regex(/^\d+(\.\d+)?$/),
  avgNav: z.string().regex(/^\d+(\.\d+)?$/),
});

export const UpdateFundDto = z.object({
  units: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgNav: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  currentNav: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  goal: z.string().optional(),
});

export type CreateFundInput = z.infer<typeof CreateFundDto>;
export type UpdateFundInput = z.infer<typeof UpdateFundDto>;
