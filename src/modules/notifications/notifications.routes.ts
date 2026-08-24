import { Request, Response, Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import { asyncHandler } from '../../common/utils/async-handler';
import * as notificationsService from './notifications.service';

export const notificationsRoutes = Router();

notificationsRoutes.use(authenticate);

notificationsRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const notifications = await notificationsService.getNotifications(req.user);
    sendSuccess(res, 'Notifications fetched', { notifications });
  })
);
