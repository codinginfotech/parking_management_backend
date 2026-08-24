import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import * as usersService from './users.service';

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const user = await usersService.updateProfile(requireUser(req), req.body);
  sendSuccess(res, 'Profile updated', { user });
}

export async function getBusiness(req: Request, res: Response): Promise<void> {
  const business = await usersService.getBusiness(requireUser(req));
  sendSuccess(res, 'Business fetched', { business });
}

export async function updateBusiness(req: Request, res: Response): Promise<void> {
  const business = await usersService.updateBusiness(requireUser(req), req.body);
  sendSuccess(res, 'Business updated', { business });
}
