import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
      .optional(),
    profileImage: z.string().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(15).optional(),
    address: z.string().trim().max(300).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });
