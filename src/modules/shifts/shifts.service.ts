import type { Prisma, StaffShift } from '@prisma/client';
import { prisma } from '../../config/database';
import { PaymentMethod } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { AuthUser, Pagination } from '../../common/types';
import { lotScopeFilter, requireBusiness } from '../../common/utils/lot-access';
import { logActivity } from '../activity/activity.service';
import { getLotOrFail } from '../parking-lots/parking-lots.service';

const METHOD_COLUMN: Record<PaymentMethod, keyof StaffShift> = {
  CASH: 'cashCollected',
  UPI: 'upiCollected',
  CARD: 'cardCollected',
  OTHER: 'otherCollected',
};

type ShiftWithRefs = StaffShift & {
  lot?: { id: string; name: string } | null;
  staff?: { fullName: string; role: string } | null;
};

export function serializeShift(shift: ShiftWithRefs) {
  return {
    _id: shift.id,
    id: shift.id,
    lot: shift.lot ? { _id: shift.lot.id, id: shift.lot.id, name: shift.lot.name } : shift.lotId,
    staff: shift.staff ? { fullName: shift.staff.fullName, role: shift.staff.role } : undefined,
    status: shift.status,
    startTime: shift.startTime,
    endTime: shift.endTime ?? undefined,
    collections: {
      CASH: shift.cashCollected,
      UPI: shift.upiCollected,
      CARD: shift.cardCollected,
      OTHER: shift.otherCollected,
    },
    totalCollected: shift.totalCollected,
    sessionsStarted: shift.sessionsStarted,
    sessionsClosed: shift.sessionsClosed,
    openingNote: shift.openingNote ?? undefined,
    closingNote: shift.closingNote ?? undefined,
  };
}

export async function startShift(user: AuthUser, lotId: string, openingNote?: string) {
  const businessId = requireBusiness(user);
  const lot = await getLotOrFail(user, lotId);

  const existing = await prisma.staffShift.findUnique({
    where: { activeKey: user.id },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict(
      'You already have an open shift. End it before starting a new one.'
    );
  }

  let shift: StaffShift;
  try {
    shift = await prisma.staffShift.create({
      data: {
        businessId,
        lotId: lot.id,
        staffId: user.id,
        openingNote,
        activeKey: user.id,
      },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    ) {
      throw AppError.conflict(
        'You already have an open shift. End it before starting a new one.'
      );
    }
    throw error;
  }

  logActivity({
    user,
    businessId,
    lotId: lot.id,
    action: 'SHIFT_STARTED',
    description: `${user.fullName} started a shift at ${lot.name}`,
    entityType: 'StaffShift',
    entityId: shift.id,
  });

  return serializeShift({ ...shift, lot: { id: lot.id, name: lot.name } });
}

export async function endShift(user: AuthUser, closingNote?: string) {
  const businessId = requireBusiness(user);
  const shift = await prisma.staffShift.findUnique({
    where: { activeKey: user.id },
  });
  if (!shift) {
    throw AppError.notFound('You have no open shift');
  }

  const closed = await prisma.staffShift.update({
    where: { id: shift.id },
    data: {
      status: 'CLOSED',
      endTime: new Date(),
      activeKey: null,
      ...(closingNote ? { closingNote } : {}),
    },
    include: { lot: { select: { id: true, name: true } } },
  });

  logActivity({
    user,
    businessId,
    lotId: shift.lotId,
    action: 'SHIFT_ENDED',
    description: `${user.fullName} ended their shift — ₹${closed.totalCollected} collected`,
    entityType: 'StaffShift',
    entityId: shift.id,
  });

  return serializeShift(closed);
}

export async function getCurrentShift(user: AuthUser) {
  const shift = await prisma.staffShift.findUnique({
    where: { activeKey: user.id },
    include: { lot: { select: { id: true, name: true } } },
  });
  return shift ? serializeShift(shift) : null;
}

export async function listShifts(
  user: AuthUser,
  filters: { lotId?: string; staffId?: string; from?: Date; to?: Date },
  pagination: Pagination
) {
  const businessId = requireBusiness(user);
  const where: Prisma.StaffShiftWhereInput = {
    businessId,
    ...lotScopeFilter(user, 'lotId'),
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
  };
  if (filters.from || filters.to) {
    where.startTime = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [shifts, total] = await Promise.all([
    prisma.staffShift.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        staff: { select: { fullName: true, role: true } },
        lot: { select: { id: true, name: true } },
      },
    }),
    prisma.staffShift.count({ where }),
  ]);

  return {
    items: shifts.map(serializeShift),
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

/** Called on session entry so the attendant's open shift tracks their work. */
export async function recordSessionStart(staffId: string): Promise<void> {
  await prisma.staffShift.updateMany({
    where: { staffId, status: 'OPEN' },
    data: { sessionsStarted: { increment: 1 } },
  });
}

/** Called when a payment is collected; keeps per-method shift totals accountable. */
export async function recordCollection(
  staffId: string,
  method: PaymentMethod,
  amount: number
): Promise<string | null> {
  const shift = await prisma.staffShift.findUnique({
    where: { activeKey: staffId },
    select: { id: true },
  });
  if (!shift) return null;
  await prisma.staffShift.update({
    where: { id: shift.id },
    data: {
      [METHOD_COLUMN[method]]: { increment: amount },
      totalCollected: { increment: amount },
      sessionsClosed: { increment: 1 },
    },
  });
  return shift.id;
}
