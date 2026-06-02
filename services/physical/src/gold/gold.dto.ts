import { z } from 'zod';

export const CreateGoldDto = z.object({
  type: z.enum(['PHYSICAL', 'DIGITAL']),
  weightGrams: z.string().regex(/^\d+(\.\d+)?$/),
  purity: z.number().refine((v) => [999, 995, 958, 916, 750, 585].includes(v)),
  purchasePricePerGram: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseDate: z.string().optional(),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateGoldDto = z.object({
  weightGrams: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  purchasePricePerGram: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  notes: z.string().optional(),
});

export const CreateSgbDto = z.object({
  seriesName: z.string().min(1),
  units: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseNav: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseDate: z.string().min(1),
  maturityDate: z.string().min(1),
  couponRate: z.string().regex(/^\d+(\.\d+)?$/).default('2.5'),
  broker: z.string().optional(),
});

export const UpdateSgbDto = z.object({
  units: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  broker: z.string().optional(),
});

export type CreateGoldInput = z.infer<typeof CreateGoldDto>;
export type UpdateGoldInput = z.infer<typeof UpdateGoldDto>;
export type CreateSgbInput = z.infer<typeof CreateSgbDto>;
export type UpdateSgbInput = z.infer<typeof UpdateSgbDto>;
