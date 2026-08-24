import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import * as controller from './users.controller';
import { updateBusinessSchema, updateProfileSchema } from './users.validation';

export const usersRoutes = Router();

usersRoutes.use(authenticate);

usersRoutes.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateMe)
);
usersRoutes.get('/business', asyncHandler(controller.getBusiness));
usersRoutes.patch(
  '/business',
  authorize('OWNER', 'ADMIN'),
  validate({ body: updateBusinessSchema }),
  asyncHandler(controller.updateBusiness)
);
