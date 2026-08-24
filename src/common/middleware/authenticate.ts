import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../errors/app-error';
import { Role } from '../constants';
import { asJson } from '../types/domain';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the Bearer access token and loads a fresh snapshot of the user.
 * Role/assignment changes and deactivation therefore apply on the next request,
 * not only after the token expires.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized();
    }
    const payload = verifyAccessToken(header.slice('Bearer '.length));

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        fullName: true,
        role: true,
        businessId: true,
        assignedLots: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive) {
      throw AppError.unauthorized('This account is no longer active.');
    }

    req.user = {
      id: user.id,
      fullName: user.fullName,
      role: user.role as Role,
      businessId: user.businessId,
      assignedLotIds: asJson<string[]>(user.assignedLots, []),
    };
    next();
  } catch (error) {
    next(error);
  }
}
