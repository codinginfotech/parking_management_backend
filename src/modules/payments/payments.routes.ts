import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS } from '../../common/constants';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import { localDayRange } from '../../common/utils/dates';
import { parsePagination } from '../../common/utils/pagination';
import * as paymentsService from './payments.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

const objectId = z.string().trim().min(6, 'Invalid id').max(64);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const paymentsRoutes = Router();

paymentsRoutes.use(authenticate);

paymentsRoutes.get(
  '/',
  validate({
    query: z.object({
      lotId: objectId.optional(),
      method: z.enum(PAYMENT_METHODS).optional(),
      date: dateString.optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const result = await paymentsService.listPayments(
      requireUser(req),
      { lotId: query.lotId, method: query.method as never, date: query.date },
      parsePagination(req.query, { limit: 30 })
    );
    sendSuccess(res, 'Payments fetched', result);
  })
);

paymentsRoutes.get(
  '/summary',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({
    query: z.object({
      lotId: objectId.optional(),
      date: dateString.optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const { start, end } = localDayRange(query.date);
    const summary = await paymentsService.paymentSummary(requireUser(req), {
      lotId: query.lotId,
      from: start,
      to: end,
    });
    sendSuccess(res, 'Payment summary fetched', { summary });
  })
);
