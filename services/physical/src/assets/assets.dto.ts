import { z } from 'zod';

export const AssetTypeEnum = z.enum(['PPF', 'EPF', 'NPS', 'FD', 'RD', 'INSURANCE', 'REAL_ESTATE', 'OTHER']);
export const EventTypeEnum = z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'MATURITY', 'PREMIUM']);

export const CreateAssetDto = z.object({
  type: AssetTypeEnum,
  name: z.string().min(1),
  institution: z.string().optional(),
  invested: z.string().regex(/^\d+(\.\d+)?$/),
  currentValue: z.string().regex(/^\d+(\.\d+)?$/),
  interestRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateAssetDto = z.object({
  currentValue: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  interestRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateEventDto = z.object({
  type: EventTypeEnum,
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  eventDate: z.string().min(1),
  notes: z.string().optional(),
});

export type CreateAssetInput = z.infer<typeof CreateAssetDto>;
export type UpdateAssetInput = z.infer<typeof UpdateAssetDto>;
export type CreateEventInput = z.infer<typeof CreateEventDto>;
