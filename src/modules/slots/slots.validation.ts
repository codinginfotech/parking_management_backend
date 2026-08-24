import { z } from 'zod';
import { VEHICLE_TYPES } from '../../common/constants';

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const listSlotsQuery = z.object({
  lotId: objectId,
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'BLOCKED']).optional(),
});

export const createSlotSchema = z.object({
  lotId: objectId,
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
});

export const bulkCreateSchema = z
  .object({
    lotId: objectId,
    prefix: z
      .string()
      .trim()
      .min(1)
      .max(4)
      .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only'),
    from: z.number().int().min(1).max(9999),
    to: z.number().int().min(1).max(9999),
    vehicleType: z.enum(VEHICLE_TYPES).optional(),
  })
  .refine((data) => data.to >= data.from && data.to - data.from < 500, {
    path: ['to'],
    message: 'Range must be ascending and at most 500 slots',
  });

export const updateSlotSchema = z
  .object({
    status: z.enum(['AVAILABLE', 'BLOCKED']).optional(),
    vehicleType: z.enum(VEHICLE_TYPES).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const slotIdParams = z.object({ id: objectId });
