import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '../constants';
import { AppError } from '../errors/app-error';

export function authorize(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden());
    }
    next();
  };
}
