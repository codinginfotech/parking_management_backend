import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authRateLimiter } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import * as controller from './auth.controller';
import {
  googleAuthSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './auth.validation';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(controller.register)
);
authRoutes.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(controller.login)
);
authRoutes.post(
  '/google',
  authRateLimiter,
  validate({ body: googleAuthSchema }),
  asyncHandler(controller.googleAuth)
);
authRoutes.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(controller.refresh)
);
authRoutes.post('/logout', authenticate, asyncHandler(controller.logout));
authRoutes.get('/me', authenticate, asyncHandler(controller.me));
