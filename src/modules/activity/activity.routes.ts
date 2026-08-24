import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { ACTIVITY_ACTIONS } from '../../common/constants';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import { parsePagination } from '../../common/utils/pagination';
import * as activityService from './activity.service';

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const activityRoutes = Router();

activityRoutes.use(authenticate);

activityRoutes.get(
  '/',
  validate({
    query: z.object({
      lotId: objectId.optional(),
      action: z.enum(ACTIVITY_ACTIONS).optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.query as Record<string, string | undefined>;
    const result = await activityService.listActivity(
      req.user,
      { lotId: query.lotId, action: query.action as never },
      parsePagination(req.query, { limit: 30 })
    );
    sendSuccess(res, 'Activity fetched', result);
  })
);
