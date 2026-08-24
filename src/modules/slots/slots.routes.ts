import { Request, Response, Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as slotsService from './slots.service';
import {
  bulkCreateSchema,
  createSlotSchema,
  listSlotsQuery,
  slotIdParams,
  updateSlotSchema,
} from './slots.validation';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const slotsRoutes = Router();

slotsRoutes.use(authenticate);

slotsRoutes.get(
  '/',
  validate({ query: listSlotsQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const slots = await slotsService.listSlots(
      requireUser(req),
      query.lotId as string,
      query.status as never
    );
    sendSuccess(res, 'Slots fetched', { slots });
  })
);

slotsRoutes.post(
  '/',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ body: createSlotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const slot = await slotsService.createSlot(requireUser(req), req.body);
    sendSuccess(res, 'Slot created', { slot }, 201);
  })
);

slotsRoutes.post(
  '/bulk',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ body: bulkCreateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await slotsService.createSlotsBulk(requireUser(req), req.body);
    sendSuccess(res, `${result.created} slots created`, result, 201);
  })
);

slotsRoutes.patch(
  '/:id',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: slotIdParams, body: updateSlotSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const slot = await slotsService.updateSlot(
      requireUser(req),
      req.params.id as string,
      req.body
    );
    sendSuccess(res, 'Slot updated', { slot });
  })
);

slotsRoutes.delete(
  '/:id',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: slotIdParams }),
  asyncHandler(async (req: Request, res: Response) => {
    await slotsService.deleteSlot(requireUser(req), req.params.id as string);
    sendSuccess(res, 'Slot deleted');
  })
);
