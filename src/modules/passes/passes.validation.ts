import { z } from 'zod';
import { VEHICLE_TYPES } from '../../common/constants';

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const createPassSchema = z.object({
  lotId: objectId.optional(),
  vehicleNumber: z.string().trim().min(4, 'Enter the vehicle number').max(16),
  vehicleType: z.enum(VEHICLE_TYPES),
  holderName: z.string().trim().min(2, "Enter the holder's name").max(80),
  holderPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional(),
  amount: z.number().min(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  months: z.number().int().min(1).max(24),
});

export const listPassesQuery = z.object({
  status: z.enum(['ACTIVE', 'UPCOMING', 'EXPIRED', 'CANCELLED']).optional(),
  search: z.string().trim().max(16).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const expiringQuery = z.object({
  days: z.coerce.number().int().min(1).max(60).default(7),
});

export const renewPassSchema = z.object({
  months: z.number().int().min(1).max(24),
  amount: z.number().min(0),
});

export const passIdParams = z.object({ id: objectId });
