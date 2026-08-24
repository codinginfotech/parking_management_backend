import { Request, Response, Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as staffService from './staff.service';
import {
  createStaffSchema,
  staffIdParams,
  updateStaffSchema,
} from './staff.validation';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const staffRoutes = Router();

staffRoutes.use(authenticate, authorize('OWNER', 'MANAGER', 'ADMIN'));

staffRoutes.post(
  '/',
  validate({ body: createStaffSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await staffService.createStaff(requireUser(req), req.body);
    sendSuccess(res, 'Staff member added', { staff }, 201);
  })
);

staffRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await staffService.listStaff(requireUser(req));
    sendSuccess(res, 'Staff fetched', { staff });
  })
);

staffRoutes.patch(
  '/:id',
  validate({ params: staffIdParams, body: updateStaffSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await staffService.updateStaff(
      requireUser(req),
      req.params.id as string,
      req.body
    );
    sendSuccess(res, 'Staff member updated', { staff });
  })
);
