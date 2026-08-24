import rateLimit from 'express-rate-limit';

const rateLimitResponse = {
  success: false,
  message: 'Too many requests. Please try again shortly.',
  errors: [],
};

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse,
});

/** Tighter limit for credential endpoints to slow brute-force attempts. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse,
});
