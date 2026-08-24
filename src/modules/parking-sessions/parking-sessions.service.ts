import type { ParkingSession, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { PaymentMethod, SOCKET_EVENTS, VehicleType } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { AuthUser, Pagination } from '../../common/types';
import { PricingRule } from '../../common/types/domain';
import {
  assertLotAccess,
  lotScopeFilter,
  requireBusiness,
} from '../../common/utils/lot-access';
import { localDateKey } from '../../common/utils/dates';
import {
  formatPlate,
  isValidPlate,
  normalizePlate,
} from '../../common/utils/vehicle-number';
import { emitToBusiness } from '../../socket';
import { logActivity } from '../activity/activity.service';
import {
  broadcastOccupancy,
  computeOccupancy,
  getLotOrFail,
  lotPricing,
} from '../parking-lots/parking-lots.service';
import { findActivePassForVehicle } from '../passes/passes.service';
import { createSessionPayment } from '../payments/payments.service';
import * as shiftsService from '../shifts/shifts.service';
import { upsertVehicleOnEntry } from '../vehicles/vehicles.service';
import { calculateParkingAmount, durationInMinutes } from './pricing.engine';

function pricingRuleFor(
  rules: PricingRule[],
  vehicleType: VehicleType
): PricingRule | undefined {
  return rules.find((rule) => rule.vehicleType === vehicleType);
}

function activeKeyFor(businessId: string, vehicleNumber: string): string {
  return `${businessId}:${vehicleNumber}`;
}

function serializeSession(
  session: ParkingSession,
  extras: Record<string, unknown> = {}
) {
  return {
    _id: session.id,
    id: session.id,
    lot: session.lotId,
    vehicleNumber: session.vehicleNumber,
    displayNumber: formatPlate(session.vehicleNumber),
    vehicleType: session.vehicleType,
    slotCode: session.slotCode ?? undefined,
    status: session.status,
    entryTime: session.entryTime,
    exitTime: session.exitTime ?? undefined,
    durationMinutes: session.durationMinutes ?? undefined,
    amount: session.amount ?? undefined,
    coveredByPass: session.coveredByPass,
    slipNumber: session.slipNumber ?? undefined,
    notes: session.notes ?? undefined,
    cancelReason: session.cancelReason ?? undefined,
    createdAt: session.createdAt,
    ...extras,
  };
}

/**
 * Allocates the next daily slip/token number for a lot (resets each IST day).
 * The unique-keyed counter row makes concurrent entries serialize safely.
 */
async function nextSlipNumber(lotId: string): Promise<number> {
  const dateKey = localDateKey(new Date());
  try {
    const counter = await prisma.dailyCounter.upsert({
      where: { lotId_dateKey: { lotId, dateKey } },
      create: { lotId, dateKey, value: 1 },
      update: { value: { increment: 1 } },
    });
    return counter.value;
  } catch (error) {
    // Two first-entries-of-the-day racing: one create wins, the other retries.
    if (isUniqueViolation(error)) {
      const counter = await prisma.dailyCounter.update({
        where: { lotId_dateKey: { lotId, dateKey } },
        data: { value: { increment: 1 } },
      });
      return counter.value;
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

interface EntryInput {
  lotId: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  slotId?: string;
  notes?: string;
}

export async function createEntry(user: AuthUser, input: EntryInput) {
  const businessId = requireBusiness(user);
  const lot = await getLotOrFail(user, input.lotId);
  if (!lot.isActive) {
    throw AppError.badRequest('This parking lot is currently inactive');
  }

  const vehicleNumber = normalizePlate(input.vehicleNumber);
  if (vehicleNumber.length < 4 || vehicleNumber.length > 12) {
    throw AppError.badRequest('Enter a valid vehicle number');
  }
  if (vehicleNumber.length >= 8 && !isValidPlate(vehicleNumber)) {
    // Full-length numbers must match Indian plate formats; shorter entries
    // (temporary/dealer plates) are allowed through deliberately.
    throw AppError.badRequest('This does not look like a valid Indian vehicle number');
  }

  const alreadyParked = await prisma.parkingSession.findUnique({
    where: { activeKey: activeKeyFor(businessId, vehicleNumber) },
    select: { id: true },
  });
  if (alreadyParked) {
    throw AppError.conflict('Vehicle is already parked');
  }

  const occupancy = await computeOccupancy(lot);
  const typeOccupancy = occupancy.byType.find(
    (entry) => entry.vehicleType === input.vehicleType
  );
  if (typeOccupancy) {
    if (typeOccupancy.occupied >= typeOccupancy.capacity) {
      throw AppError.conflict(`No space available for this vehicle type at ${lot.name}`);
    }
  } else if (occupancy.occupied >= occupancy.capacity) {
    throw AppError.conflict(`${lot.name} is full`);
  }

  let slotCode: string | undefined;
  if (input.slotId) {
    const slot = await prisma.parkingSlot.findFirst({
      where: { id: input.slotId, lotId: lot.id },
    });
    if (!slot) throw AppError.notFound('Parking slot not found');
    if (slot.status !== 'AVAILABLE') {
      throw AppError.conflict(`Slot ${slot.code} is not available`);
    }
    if (slot.vehicleType && slot.vehicleType !== input.vehicleType) {
      throw AppError.badRequest(`Slot ${slot.code} is reserved for another vehicle type`);
    }
    slotCode = slot.code;
  }

  const [vehicle, pass] = await Promise.all([
    upsertVehicleOnEntry(businessId, vehicleNumber, input.vehicleType),
    findActivePassForVehicle(businessId, vehicleNumber, lot.id),
  ]);

  const slipNumber = await nextSlipNumber(lot.id);

  let session: ParkingSession;
  try {
    session = await prisma.parkingSession.create({
      data: {
        businessId,
        lotId: lot.id,
        vehicleId: vehicle.id,
        vehicleNumber,
        vehicleType: input.vehicleType,
        slotId: input.slotId,
        slotCode,
        coveredByPass: Boolean(pass),
        passId: pass?.id,
        entryById: user.id,
        notes: input.notes,
        slipNumber,
        activeKey: activeKeyFor(businessId, vehicleNumber),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('Vehicle is already parked');
    }
    throw error;
  }

  if (input.slotId) {
    await prisma.parkingSlot.update({
      where: { id: input.slotId },
      data: { status: 'OCCUPIED', activeSessionId: session.id },
    });
  }

  await shiftsService.recordSessionStart(user.id);

  logActivity({
    user,
    businessId,
    lotId: lot.id,
    action: 'VEHICLE_ENTRY',
    description: `${formatPlate(vehicleNumber)} entered ${lot.name}${slotCode ? ` (${slotCode})` : ''}`,
    entityType: 'ParkingSession',
    entityId: session.id,
    meta: { vehicleType: input.vehicleType },
  });

  emitToBusiness(businessId, SOCKET_EVENTS.VEHICLE_ENTERED, {
    sessionId: session.id,
    lotId: lot.id,
    vehicleNumber,
    displayNumber: formatPlate(vehicleNumber),
    vehicleType: input.vehicleType,
    entryTime: session.entryTime,
  });
  const updatedOccupancy = await broadcastOccupancy(lot);

  return {
    session: serializeSession(session, { coveredByPass: Boolean(pass) }),
    occupancy: updatedOccupancy,
  };
}

export async function listActiveSessions(
  user: AuthUser,
  filters: {
    lotId?: string;
    search?: string;
    vehicleType?: VehicleType;
    sort?: 'newest' | 'oldest';
  },
  pagination: Pagination
) {
  const businessId = requireBusiness(user);
  const where: Prisma.ParkingSessionWhereInput = {
    businessId,
    status: 'ACTIVE',
    ...lotScopeFilter(user, 'lotId'),
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    ...(filters.search
      ? { vehicleNumber: { contains: normalizePlate(filters.search) } }
      : {}),
  };

  const [sessions, total] = await Promise.all([
    prisma.parkingSession.findMany({
      where,
      orderBy: { entryTime: filters.sort === 'oldest' ? 'asc' : 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.parkingSession.count({ where }),
  ]);

  // Estimated amounts are computed here, not on the client.
  const lotIds = [...new Set(sessions.map((session) => session.lotId))];
  const lots = await prisma.parkingLot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, name: true, pricing: true },
  });
  const lotMap = new Map(lots.map((lot) => [lot.id, lot]));

  const items = sessions.map((session) => {
    const lot = lotMap.get(session.lotId);
    const duration = durationInMinutes(session.entryTime);
    const estimatedAmount = session.coveredByPass
      ? 0
      : calculateParkingAmount(
          lot ? pricingRuleFor(lotPricing(lot), session.vehicleType as VehicleType) : undefined,
          duration
        );
    return serializeSession(session, {
      lotName: lot?.name,
      durationMinutes: duration,
      estimatedAmount,
    });
  });

  return { items, total, page: pagination.page, limit: pagination.limit };
}

/** Exit flow step 1: find the active session and preview the charge. */
export async function lookupActiveSession(user: AuthUser, rawNumber: string) {
  const businessId = requireBusiness(user);
  const vehicleNumber = normalizePlate(rawNumber);
  const session = await prisma.parkingSession.findUnique({
    where: { activeKey: activeKeyFor(businessId, vehicleNumber) },
  });
  if (!session) {
    throw AppError.notFound('No active parking found for this vehicle');
  }
  assertLotAccess(user, session.lotId);
  return previewSession(session);
}

export async function getSessionPreview(user: AuthUser, sessionId: string) {
  const businessId = requireBusiness(user);
  const session = await prisma.parkingSession.findFirst({
    where: { id: sessionId, businessId },
  });
  if (!session) throw AppError.notFound('Parking session not found');
  assertLotAccess(user, session.lotId);
  return previewSession(session);
}

async function previewSession(session: ParkingSession) {
  const lot = await prisma.parkingLot.findUnique({
    where: { id: session.lotId },
    select: { name: true, pricing: true },
  });
  const duration = durationInMinutes(session.entryTime);
  const amount =
    session.status !== 'ACTIVE'
      ? (session.amount ?? 0)
      : session.coveredByPass
        ? 0
        : calculateParkingAmount(
            lot
              ? pricingRuleFor(lotPricing(lot), session.vehicleType as VehicleType)
              : undefined,
            duration
          );
  return serializeSession(session, {
    lotName: lot?.name,
    durationMinutes: session.durationMinutes ?? duration,
    currentAmount: amount,
  });
}

interface ExitInput {
  sessionId: string;
  paymentMethod?: PaymentMethod;
  transactionRef?: string;
}

export async function completeExit(user: AuthUser, input: ExitInput) {
  const businessId = requireBusiness(user);
  const session = await prisma.parkingSession.findFirst({
    where: { id: input.sessionId, businessId, status: 'ACTIVE' },
  });
  if (!session) {
    throw AppError.notFound('Active parking session not found');
  }
  assertLotAccess(user, session.lotId);

  const lot = await prisma.parkingLot.findUnique({ where: { id: session.lotId } });
  if (!lot) throw AppError.notFound('Parking lot not found');

  const exitTime = new Date();
  const duration = durationInMinutes(session.entryTime, exitTime);
  const amount = session.coveredByPass
    ? 0
    : calculateParkingAmount(
        pricingRuleFor(lotPricing(lot), session.vehicleType as VehicleType),
        duration
      );

  if (amount > 0 && !input.paymentMethod) {
    throw AppError.badRequest('Select a payment method to collect the charge');
  }

  let payment = null;
  if (amount > 0 && input.paymentMethod) {
    payment = await createSessionPayment({
      user,
      businessId,
      lotId: lot.id,
      sessionId: session.id,
      vehicleNumber: session.vehicleNumber,
      amount,
      method: input.paymentMethod,
      transactionRef: input.transactionRef,
    });
  }

  const completed = await prisma.parkingSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      exitTime,
      durationMinutes: duration,
      amount,
      exitById: user.id,
      paymentId: payment?.id,
      activeKey: null,
    },
  });

  if (session.slotId) {
    await prisma.parkingSlot.update({
      where: { id: session.slotId },
      data: { status: 'AVAILABLE', activeSessionId: null },
    });
  }

  logActivity({
    user,
    businessId,
    lotId: lot.id,
    action: 'VEHICLE_EXIT',
    description: `${formatPlate(session.vehicleNumber)} exited ${lot.name} after ${Math.floor(duration / 60)}h ${duration % 60}m`,
    entityType: 'ParkingSession',
    entityId: session.id,
    meta: { amount, coveredByPass: session.coveredByPass },
  });

  emitToBusiness(businessId, SOCKET_EVENTS.VEHICLE_EXITED, {
    sessionId: session.id,
    lotId: lot.id,
    vehicleNumber: session.vehicleNumber,
    displayNumber: formatPlate(session.vehicleNumber),
    amount,
    exitTime,
  });
  await broadcastOccupancy(lot);

  return {
    session: serializeSession(completed),
    payment: payment
      ? {
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          receiptNumber: payment.receiptNumber,
          paidAt: payment.paidAt,
        }
      : null,
  };
}

export async function cancelSession(user: AuthUser, sessionId: string, reason: string) {
  const businessId = requireBusiness(user);
  const session = await prisma.parkingSession.findFirst({
    where: { id: sessionId, businessId, status: 'ACTIVE' },
  });
  if (!session) throw AppError.notFound('Active parking session not found');
  assertLotAccess(user, session.lotId);

  const cancelled = await prisma.parkingSession.update({
    where: { id: session.id },
    data: {
      status: 'CANCELLED',
      exitTime: new Date(),
      cancelReason: reason,
      exitById: user.id,
      activeKey: null,
    },
  });

  if (session.slotId) {
    await prisma.parkingSlot.update({
      where: { id: session.slotId },
      data: { status: 'AVAILABLE', activeSessionId: null },
    });
  }

  const lot = await prisma.parkingLot.findUnique({ where: { id: session.lotId } });
  logActivity({
    user,
    businessId,
    lotId: session.lotId,
    action: 'SESSION_CANCELLED',
    description: `Session for ${formatPlate(session.vehicleNumber)} cancelled — ${reason}`,
    entityType: 'ParkingSession',
    entityId: session.id,
  });
  if (lot) await broadcastOccupancy(lot);

  return serializeSession(cancelled);
}

export async function listSessionHistory(
  user: AuthUser,
  filters: { lotId?: string; search?: string },
  pagination: Pagination,
  dayRange?: { start: Date; end: Date }
) {
  const businessId = requireBusiness(user);
  const where: Prisma.ParkingSessionWhereInput = {
    businessId,
    status: { in: ['COMPLETED', 'CANCELLED'] },
    ...lotScopeFilter(user, 'lotId'),
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.search
      ? { vehicleNumber: { contains: normalizePlate(filters.search) } }
      : {}),
    ...(dayRange ? { entryTime: { gte: dayRange.start, lt: dayRange.end } } : {}),
  };

  const [sessions, total] = await Promise.all([
    prisma.parkingSession.findMany({
      where,
      orderBy: { exitTime: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: { lot: { select: { id: true, name: true } } },
    }),
    prisma.parkingSession.count({ where }),
  ]);

  return {
    items: sessions.map((session) =>
      serializeSession(session, { lotName: session.lot.name })
    ),
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}
