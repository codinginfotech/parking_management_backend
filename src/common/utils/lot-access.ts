import { AuthUser } from '../types';
import { AppError } from '../errors/app-error';

/**
 * OWNER/ADMIN see every lot of the business. MANAGER/ATTENDANT are limited to
 * their assigned lots; an empty assignment list means "all lots" so a one-lot
 * business works with zero configuration.
 */
export function canAccessLot(user: AuthUser, lotId: string): boolean {
  if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
  if (user.assignedLotIds.length === 0) return true;
  return user.assignedLotIds.includes(lotId);
}

export function assertLotAccess(user: AuthUser, lotId: string): void {
  if (!canAccessLot(user, lotId)) {
    throw AppError.forbidden('You are not assigned to this parking lot.');
  }
}

/** Prisma where-fragment restricting a lot-scoped query to accessible lots. */
export function lotScopeFilter(
  user: AuthUser,
  field = 'lotId'
): Record<string, unknown> {
  if (user.role === 'OWNER' || user.role === 'ADMIN') return {};
  if (user.assignedLotIds.length === 0) return {};
  return { [field]: { in: user.assignedLotIds } };
}

export function requireBusiness(user: AuthUser): string {
  if (!user.businessId) {
    throw AppError.forbidden('No business is linked to this account.');
  }
  return user.businessId;
}
