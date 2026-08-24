import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(80),
    businessName: z.string().trim().min(2, 'Enter your business name').max(120),
    email,
    phone,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(20, 'Google credential is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
