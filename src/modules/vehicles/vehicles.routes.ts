import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as vehiclesService from './vehicles.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const vehiclesRoutes = Router();

vehiclesRoutes.use(authenticate);

vehiclesRoutes.get(
  '/search',
  validate({ query: z.object({ q: z.string().trim().min(2).max(16) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const vehicles = await vehiclesService.searchVehicles(
      requireUser(req),
      (req.query as Record<string, string>).q as string
    );
    sendSuccess(res, 'Vehicles fetched', { vehicles });
  })
);

vehiclesRoutes.get(
  '/:number/history',
  validate({ params: z.object({ number: z.string().trim().min(3).max(16) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await vehiclesService.getVehicleHistory(
      requireUser(req),
      req.params.number as string
    );
    sendSuccess(res, 'Vehicle history fetched', result);
  })
);
