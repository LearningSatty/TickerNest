import { z } from 'zod';

export const CreateUlipDto = z.object({
  insurer: z.string().min(1),
  planName: z.string().min(1),
  policyNumber: z.string().optional(),
  premium: z.string().regex(/^\d+(\.\d+)?$/),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).default('YEARLY'),
  fundValue: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
});

export const UpdateUlipDto = z.object({
  fundValue: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
});

export type CreateUlipInput = z.infer<typeof CreateUlipDto>;
export type UpdateUlipInput = z.infer<typeof UpdateUlipDto>;
