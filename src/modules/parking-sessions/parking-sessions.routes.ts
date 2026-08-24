import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import * as controller from './parking-sessions.controller';
import {
  activeListQuery,
  cancelSchema,
  entrySchema,
  exitSchema,
  historyQuery,
  lookupQuery,
  sessionIdParams,
} from './parking-sessions.validation';

export const parkingSessionsRoutes = Router();

parkingSessionsRoutes.use(authenticate);

parkingSessionsRoutes.post(
  '/entry',
  validate({ body: entrySchema }),
  asyncHandler(controller.entry)
);
parkingSessionsRoutes.get(
  '/active',
  validate({ query: activeListQuery }),
  asyncHandler(controller.active)
);
parkingSessionsRoutes.get(
  '/lookup',
  validate({ query: lookupQuery }),
  asyncHandler(controller.lookup)
);
parkingSessionsRoutes.get(
  '/history',
  validate({ query: historyQuery }),
  asyncHandler(controller.history)
);
parkingSessionsRoutes.get(
  '/:id',
  validate({ params: sessionIdParams }),
  asyncHandler(controller.preview)
);
parkingSessionsRoutes.post(
  '/:id/exit',
  validate({ params: sessionIdParams, body: exitSchema }),
  asyncHandler(controller.exit)
);
parkingSessionsRoutes.post(
  '/:id/cancel',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: sessionIdParams, body: cancelSchema }),
  asyncHandler(controller.cancel)
);
