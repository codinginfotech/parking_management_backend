import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isProduction } from '../../config/env';
import { AppError } from '../errors/app-error';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A record with these details already exists',
        errors: [],
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Resource not found', errors: [] });
      return;
    }
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'A referenced record does not exist',
        errors: [],
      });
      return;
    }
  }

  logger.error('Unhandled error', error);
  res.status(500).json({
    success: false,
    message: isProduction
      ? 'Something went wrong. Please try again.'
      : error instanceof Error
        ? error.message
        : 'Unknown error',
    errors: [],
  });
}
