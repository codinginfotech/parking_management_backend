import { Request, Response, Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import { parsePagination } from '../../common/utils/pagination';
import * as passesService from './passes.service';
import {
  createPassSchema,
  expiringQuery,
  listPassesQuery,
  passIdParams,
  renewPassSchema,
} from './passes.validation';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const passesRoutes = Router();

passesRoutes.use(authenticate);

passesRoutes.post(
  '/',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ body: createPassSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pass = await passesService.createPass(requireUser(req), req.body);
    sendSuccess(res, 'Monthly pass created', { pass }, 201);
  })
);

passesRoutes.get(
  '/',
  validate({ query: listPassesQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const result = await passesService.listPasses(
      requireUser(req),
      { status: query.status as never, search: query.search },
      parsePagination(req.query, { limit: 30 })
    );
    sendSuccess(res, 'Passes fetched', result);
  })
);

passesRoutes.get(
  '/expiring',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ query: expiringQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number((req.query as Record<string, unknown>).days ?? 7);
    const passes = await passesService.getExpiringPasses(requireUser(req), days);
    sendSuccess(res, 'Expiring passes fetched', { passes });
  })
);

passesRoutes.post(
  '/:id/renew',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: passIdParams, body: renewPassSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const pass = await passesService.renewPass(
      requireUser(req),
      req.params.id as string,
      req.body.months,
      req.body.amount
    );
    sendSuccess(res, 'Pass renewed', { pass });
  })
);

passesRoutes.post(
  '/:id/cancel',
  authorize('OWNER', 'MANAGER', 'ADMIN'),
  validate({ params: passIdParams }),
  asyncHandler(async (req: Request, res: Response) => {
    const pass = await passesService.cancelPass(requireUser(req), req.params.id as string);
    sendSuccess(res, 'Pass cancelled', { pass });
  })
);
