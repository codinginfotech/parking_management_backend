import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as reportsService from './reports.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

const objectId = z.string().trim().min(6, 'Invalid id').max(64);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const reportsRoutes = Router();

reportsRoutes.use(authenticate, authorize('OWNER', 'MANAGER', 'ADMIN'));

reportsRoutes.get(
  '/daily',
  validate({
    query: z.object({ date: dateString.optional(), lotId: objectId.optional() }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const report = await reportsService.dailyReport(
      requireUser(req),
      query.date,
      query.lotId
    );
    sendSuccess(res, 'Daily report generated', { report });
  })
);

reportsRoutes.get(
  '/range',
  validate({
    query: z.object({
      from: dateString,
      to: dateString,
      lotId: objectId.optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string>;
    const report = await reportsService.rangeReport(
      requireUser(req),
      query.from as string,
      query.to as string,
      query.lotId
    );
    sendSuccess(res, 'Range report generated', { report });
  })
);
