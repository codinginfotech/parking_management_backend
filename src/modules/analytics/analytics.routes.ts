import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as analyticsService from './analytics.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const analyticsRoutes = Router();

// Every role sees the live overview - it powers the home screen.
analyticsRoutes.use(authenticate);

analyticsRoutes.get(
  '/overview',
  validate({ query: z.object({ lotId: objectId.optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const overview = await analyticsService.overview(
      requireUser(req),
      (req.query as Record<string, string | undefined>).lotId
    );
    sendSuccess(res, 'Overview fetched', { overview });
  })
);

analyticsRoutes.get(
  '/trends',
  validate({
    query: z.object({
      days: z.coerce.number().int().min(2).max(90).default(7),
      lotId: objectId.optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const series = await analyticsService.trends(
      requireUser(req),
      Number(query.days ?? 7),
      query.lotId
    );
    sendSuccess(res, 'Trends fetched', { series });
  })
);

analyticsRoutes.get(
  '/peak-hours',
  validate({
    query: z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
      lotId: objectId.optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const hours = await analyticsService.peakHours(
      requireUser(req),
      Number(query.days ?? 30),
      query.lotId
    );
    sendSuccess(res, 'Peak hours fetched', { hours });
  })
);
