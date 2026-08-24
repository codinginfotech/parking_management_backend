import { z } from 'zod';

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
  role: z.enum(['MANAGER', 'ATTENDANT']),
  assignedLotIds: z.array(objectId).default([]),
});

export const updateStaffSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
      .optional(),
    role: z.enum(['MANAGER', 'ATTENDANT']).optional(),
    assignedLotIds: z.array(objectId).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const staffIdParams = z.object({ id: objectId });
