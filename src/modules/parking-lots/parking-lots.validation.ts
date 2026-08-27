import { z } from 'zod';
import { PRICING_MODES, VEHICLE_TYPES } from '../../common/constants';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const capacityEntry = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
  spaces: z.number().int().min(1).max(10000),
});

const pricingRule = z
  .object({
    vehicleType: z.enum(VEHICLE_TYPES),
    mode: z.enum(PRICING_MODES),
    flatRate: z.number().min(0).optional(),
    firstHourRate: z.number().min(0).optional(),
    additionalHourRate: z.number().min(0).optional(),
    slabs: z
      .array(
        z.object({
          uptoMinutes: z.number().int().min(1),
          amount: z.number().min(0),
        })
      )
      .min(1)
      .optional(),
    overflowHourlyRate: z.number().min(0).optional(),
    dailyRate: z.number().min(0).optional(),
    dailyMax: z.number().min(0).optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.mode === 'FLAT' && rule.flatRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flatRate'],
        message: 'Flat pricing requires a flat rate',
      });
    }
    if (rule.mode === 'HOURLY' && rule.firstHourRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['firstHourRate'],
        message: 'Hourly pricing requires a first-hour rate',
      });
    }
    if (rule.mode === 'DAILY' && rule.dailyRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dailyRate'],
        message: 'Per-day pricing requires a daily rate',
      });
    }
    if (rule.mode === 'SLAB') {
      if (!rule.slabs || rule.slabs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slabs'],
          message: 'Slab pricing requires at least one slab',
        });
      } else {
        const sorted = [...rule.slabs].sort((a, b) => a.uptoMinutes - b.uptoMinutes);
        const hasDuplicates = sorted.some(
          (slab, i) => i > 0 && slab.uptoMinutes === sorted[i - 1]!.uptoMinutes
        );
        if (hasDuplicates) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slabs'],
            message: 'Slab boundaries must be unique',
          });
        }
      }
    }
  });

const operatingHours = z
  .object({
    is24Hours: z.boolean().default(true),
    open: z.string().regex(timePattern, 'Use HH:mm').optional(),
    close: z.string().regex(timePattern, 'Use HH:mm').optional(),
  })
  .superRefine((hours, ctx) => {
    if (!hours.is24Hours && (!hours.open || !hours.close)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['open'],
        message: 'Provide open and close times, or mark the lot 24 hours',
      });
    }
  });

const lotBase = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).optional(),
  capacity: z.array(capacityEntry).min(1, 'Add capacity for at least one vehicle type'),
  pricing: z.array(pricingRule).default([]),
  operatingHours: operatingHours.default({ is24Hours: true }),
});

/** Every vehicle type with capacity must have a pricing rule so exits can always be billed. */
function ensurePricingCoversCapacity(
  data: { capacity: { vehicleType: string }[]; pricing: { vehicleType: string }[] },
  ctx: z.RefinementCtx
): void {
  const priced = new Set(data.pricing.map((rule) => rule.vehicleType));
  const missing = data.capacity
    .map((entry) => entry.vehicleType)
    .filter((type) => !priced.has(type));
  if (missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pricing'],
      message: `Add pricing for: ${missing.join(', ')}`,
    });
  }
}

export const createLotSchema = lotBase.superRefine(ensurePricingCoversCapacity);

export const updateLotSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(300).optional(),
    capacity: z.array(capacityEntry).min(1).optional(),
    pricing: z.array(pricingRule).min(1).optional(),
    operatingHours: operatingHours.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const lotIdParams = z.object({
  id: z.string().trim().min(6, 'Invalid lot id').max(64),
});
