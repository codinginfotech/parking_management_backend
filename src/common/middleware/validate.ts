import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { AppError, FieldError } from '../errors/app-error';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(AppError.validation(toFieldErrors(error)));
      }
      next(error);
    }
  };
}
