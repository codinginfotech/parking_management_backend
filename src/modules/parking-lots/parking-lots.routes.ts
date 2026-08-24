import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import * as controller from './parking-lots.controller';
import {
  createLotSchema,
  lotIdParams,
  updateLotSchema,
} from './parking-lots.validation';

export const parkingLotsRoutes = Router();

parkingLotsRoutes.use(authenticate);

parkingLotsRoutes.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate({ body: createLotSchema }),
  asyncHandler(controller.create)
);
parkingLotsRoutes.get('/', asyncHandler(controller.list));
parkingLotsRoutes.get(
  '/:id',
  validate({ params: lotIdParams }),
  asyncHandler(controller.detail)
);
parkingLotsRoutes.get(
  '/:id/occupancy',
  validate({ params: lotIdParams }),
  asyncHandler(controller.occupancy)
);
parkingLotsRoutes.patch(
  '/:id',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: lotIdParams, body: updateLotSchema }),
  asyncHandler(controller.update)
);
