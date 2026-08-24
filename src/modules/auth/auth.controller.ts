import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/utils/api-response';
import * as authService from './auth.service';

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  sendSuccess(res, 'Account created successfully', result, 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  sendSuccess(res, 'Signed in successfully', result);
}

export async function googleAuth(req: Request, res: Response): Promise<void> {
  const result = await authService.googleAuth(req.body.idToken);
  sendSuccess(res, 'Signed in with Google', result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const result = await authService.refreshSession(req.body.refreshToken);
  sendSuccess(res, 'Session refreshed', result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (!req.user) throw AppError.unauthorized();
  await authService.logout(req.user.id, req.body?.refreshToken);
  sendSuccess(res, 'Signed out successfully');
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw AppError.unauthorized();
  const user = await authService.getMe(req.user.id);
  sendSuccess(res, 'Profile fetched', { user });
}
