import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import { parsePagination } from '../../common/utils/pagination';
import * as shiftsService from './shifts.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

const objectId = z.string().trim().min(6, 'Invalid id').max(64);

export const shiftsRoutes = Router();

shiftsRoutes.use(authenticate);

shiftsRoutes.post(
  '/start',
  validate({
    body: z.object({
      lotId: objectId,
      openingNote: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const shift = await shiftsService.startShift(
      requireUser(req),
      req.body.lotId,
      req.body.openingNote
    );
    sendSuccess(res, 'Shift started', { shift }, 201);
  })
);

shiftsRoutes.post(
  '/end',
  validate({
    body: z.object({ closingNote: z.string().trim().max(300).optional() }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const shift = await shiftsService.endShift(requireUser(req), req.body.closingNote);
    sendSuccess(res, 'Shift ended', { shift });
  })
);

shiftsRoutes.get(
  '/current',
  asyncHandler(async (req: Request, res: Response) => {
    const shift = await shiftsService.getCurrentShift(requireUser(req));
    sendSuccess(res, 'Current shift fetched', { shift });
  })
);

shiftsRoutes.get(
  '/',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({
    query: z.object({
      lotId: objectId.optional(),
      staffId: objectId.optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const result = await shiftsService.listShifts(
      requireUser(req),
      {
        lotId: query.lotId,
        staffId: query.staffId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      parsePagination(req.query, { limit: 30 })
    );
    sendSuccess(res, 'Shifts fetched', result);
  })
);
