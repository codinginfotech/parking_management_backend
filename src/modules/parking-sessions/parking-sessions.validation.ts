import { z } from 'zod';
import { PAYMENT_METHODS, VEHICLE_TYPES } from '../../common/constants';

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const entrySchema = z.object({
  lotId: objectId,
  vehicleNumber: z.string().trim().min(4, 'Enter the vehicle number').max(16),
  vehicleType: z.enum(VEHICLE_TYPES),
  slotId: objectId.optional(),
  notes: z.string().trim().max(300).optional(),
});

export const activeListQuery = z.object({
  lotId: objectId.optional(),
  search: z.string().trim().max(16).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  sort: z.enum(['newest', 'oldest']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const lookupQuery = z.object({
  vehicleNumber: z.string().trim().min(3, 'Enter the vehicle number').max(16),
});

export const exitSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  transactionRef: z.string().trim().max(120).optional(),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(300),
});

export const historyQuery = z.object({
  lotId: objectId.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  search: z.string().trim().max(16).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const sessionIdParams = z.object({ id: objectId });
