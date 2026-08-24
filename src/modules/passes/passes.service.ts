import type { MonthlyPass, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../common/errors/app-error';
import { AuthUser, Pagination } from '../../common/types';
import { PassRenewal, asJson } from '../../common/types/domain';
import { requireBusiness } from '../../common/utils/lot-access';
import { formatPlate, normalizePlate } from '../../common/utils/vehicle-number';
import { logActivity } from '../activity/activity.service';

export type EffectivePassStatus = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';

export function effectiveStatus(pass: {
  status: string;
  startDate: Date;
  endDate: Date;
}): EffectivePassStatus {
  if (pass.status === 'CANCELLED') return 'CANCELLED';
  const now = new Date();
  if (pass.endDate < now) return 'EXPIRED';
  if (pass.startDate > now) return 'UPCOMING';
  return 'ACTIVE';
}

function serializePass(pass: MonthlyPass) {
  return {
    _id: pass.id,
    id: pass.id,
    vehicleNumber: pass.vehicleNumber,
    displayNumber: formatPlate(pass.vehicleNumber),
    vehicleType: pass.vehicleType,
    holderName: pass.holderName,
    holderPhone: pass.holderPhone ?? undefined,
    amount: pass.amount,
    startDate: pass.startDate,
    endDate: pass.endDate,
    status: pass.status,
    effectiveStatus: effectiveStatus(pass),
    renewals: asJson<PassRenewal[]>(pass.renewals, []),
    createdAt: pass.createdAt,
  };
}

/** Used by vehicle entry to auto-detect a valid pass. */
export async function findActivePassForVehicle(
  businessId: string,
  vehicleNumber: string,
  lotId: string
): Promise<MonthlyPass | null> {
  const now = new Date();
  return prisma.monthlyPass.findFirst({
    where: {
      businessId,
      vehicleNumber,
      status: 'ACTIVE',
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ lotId: null }, { lotId }],
    },
  });
}

interface CreatePassInput {
  lotId?: string;
  vehicleNumber: string;
  vehicleType: string;
  holderName: string;
  holderPhone?: string;
  amount: number;
  startDate: string;
  months: number;
}

export async function createPass(user: AuthUser, input: CreatePassInput) {
  const businessId = requireBusiness(user);
  const vehicleNumber = normalizePlate(input.vehicleNumber);

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + input.months);

  const overlapping = await prisma.monthlyPass.findFirst({
    where: {
      businessId,
      vehicleNumber,
      status: 'ACTIVE',
      startDate: { lt: end },
      endDate: { gt: start },
    },
  });
  if (overlapping) {
    throw AppError.conflict('This vehicle already has a pass covering that period');
  }

  const pass = await prisma.monthlyPass.create({
    data: {
      businessId,
      lotId: input.lotId,
      vehicleNumber,
      vehicleType: input.vehicleType,
      holderName: input.holderName,
      holderPhone: input.holderPhone,
      amount: Math.round(input.amount),
      startDate: start,
      endDate: end,
      createdById: user.id,
    },
  });

  logActivity({
    user,
    businessId,
    lotId: input.lotId,
    action: 'PASS_CREATED',
    description: `Monthly pass created for ${formatPlate(vehicleNumber)}`,
    entityType: 'MonthlyPass',
    entityId: pass.id,
  });

  return serializePass(pass);
}

export async function listPasses(
  user: AuthUser,
  filters: { status?: EffectivePassStatus; search?: string },
  pagination: Pagination
) {
  const businessId = requireBusiness(user);
  const now = new Date();
  const where: Prisma.MonthlyPassWhereInput = { businessId };

  if (filters.status === 'ACTIVE') {
    where.status = 'ACTIVE';
    where.startDate = { lte: now };
    where.endDate = { gte: now };
  } else if (filters.status === 'EXPIRED') {
    where.status = 'ACTIVE';
    where.endDate = { lt: now };
  } else if (filters.status === 'CANCELLED') {
    where.status = 'CANCELLED';
  }
  if (filters.search) {
    where.vehicleNumber = { contains: normalizePlate(filters.search) };
  }

  const [passes, total] = await Promise.all([
    prisma.monthlyPass.findMany({
      where,
      orderBy: { endDate: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.monthlyPass.count({ where }),
  ]);

  return {
    items: passes.map(serializePass),
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

export async function getExpiringPasses(user: AuthUser, withinDays: number) {
  const businessId = requireBusiness(user);
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const passes = await prisma.monthlyPass.findMany({
    where: {
      businessId,
      status: 'ACTIVE',
      endDate: { gte: now, lte: horizon },
    },
    orderBy: { endDate: 'asc' },
  });
  return passes.map(serializePass);
}

export async function renewPass(
  user: AuthUser,
  passId: string,
  months: number,
  amount: number
) {
  const businessId = requireBusiness(user);
  const pass = await prisma.monthlyPass.findFirst({
    where: { id: passId, businessId },
  });
  if (!pass) throw AppError.notFound('Pass not found');
  if (pass.status === 'CANCELLED') {
    throw AppError.badRequest('A cancelled pass cannot be renewed');
  }

  const base = pass.endDate > new Date() ? pass.endDate : new Date();
  const newEnd = new Date(base);
  newEnd.setUTCMonth(newEnd.getUTCMonth() + months);

  const renewals = asJson<PassRenewal[]>(pass.renewals, []);
  renewals.push({
    renewedAt: new Date().toISOString(),
    months,
    amount: Math.round(amount),
    by: user.id,
  });

  const updated = await prisma.monthlyPass.update({
    where: { id: pass.id },
    data: { endDate: newEnd, renewals: renewals as unknown as object[] },
  });

  logActivity({
    user,
    businessId,
    action: 'PASS_RENEWED',
    description: `Pass renewed for ${formatPlate(pass.vehicleNumber)} (+${months} months)`,
    entityType: 'MonthlyPass',
    entityId: pass.id,
  });

  return serializePass(updated);
}

export async function cancelPass(user: AuthUser, passId: string) {
  const businessId = requireBusiness(user);
  const pass = await prisma.monthlyPass.findFirst({
    where: { id: passId, businessId },
  });
  if (!pass) throw AppError.notFound('Pass not found');
  const updated = await prisma.monthlyPass.update({
    where: { id: pass.id },
    data: { status: 'CANCELLED' },
  });

  logActivity({
    user,
    businessId,
    action: 'PASS_CANCELLED',
    description: `Pass cancelled for ${formatPlate(pass.vehicleNumber)}`,
    entityType: 'MonthlyPass',
    entityId: pass.id,
  });

  return serializePass(updated);
}
