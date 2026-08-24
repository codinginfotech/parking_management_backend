import type { ParkingLot } from '@prisma/client';
import { prisma } from '../../config/database';
import { SOCKET_EVENTS, VehicleType } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/types';
import {
  CapacityEntry,
  OperatingHours,
  PricingRule,
  asJson,
} from '../../common/types/domain';
import {
  assertLotAccess,
  lotScopeFilter,
  requireBusiness,
} from '../../common/utils/lot-access';
import { emitToBusiness } from '../../socket';
import { logActivity } from '../activity/activity.service';

export interface LotOccupancy {
  lotId: string;
  capacity: number;
  occupied: number;
  available: number;
  byType: { vehicleType: VehicleType; capacity: number; occupied: number }[];
}

export function lotCapacity(lot: ParkingLot): CapacityEntry[] {
  return asJson<CapacityEntry[]>(lot.capacity, []);
}

export function lotPricing(lot: Pick<ParkingLot, 'pricing'>): PricingRule[] {
  return asJson<PricingRule[]>(lot.pricing, []);
}

export function totalCapacity(lot: ParkingLot): number {
  return lotCapacity(lot).reduce((sum, entry) => sum + entry.spaces, 0);
}

export function serializeLot(lot: ParkingLot, extras: Record<string, unknown> = {}) {
  return {
    _id: lot.id,
    id: lot.id,
    name: lot.name,
    address: lot.address ?? undefined,
    capacity: lotCapacity(lot),
    pricing: lotPricing(lot),
    operatingHours: asJson<OperatingHours>(lot.operatingHours, { is24Hours: true }),
    isActive: lot.isActive,
    totalCapacity: totalCapacity(lot),
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    ...extras,
  };
}

export async function getLotOrFail(user: AuthUser, lotId: string): Promise<ParkingLot> {
  const businessId = requireBusiness(user);
  const lot = await prisma.parkingLot.findFirst({
    where: { id: lotId, businessId },
  });
  if (!lot) throw AppError.notFound('Parking lot not found');
  assertLotAccess(user, lot.id);
  return lot;
}

export async function computeOccupancy(lot: ParkingLot): Promise<LotOccupancy> {
  const counts = await prisma.parkingSession.groupBy({
    by: ['vehicleType'],
    where: { lotId: lot.id, status: 'ACTIVE' },
    _count: { _all: true },
  });
  const occupiedByType = new Map(
    counts.map((entry) => [entry.vehicleType, entry._count._all])
  );
  const byType = lotCapacity(lot).map((entry) => ({
    vehicleType: entry.vehicleType,
    capacity: entry.spaces,
    occupied: occupiedByType.get(entry.vehicleType) ?? 0,
  }));
  const occupied = counts.reduce((sum, entry) => sum + entry._count._all, 0);
  const capacity = totalCapacity(lot);
  return {
    lotId: lot.id,
    capacity,
    occupied,
    available: Math.max(0, capacity - occupied),
    byType,
  };
}

export async function broadcastOccupancy(lot: ParkingLot): Promise<LotOccupancy> {
  const occupancy = await computeOccupancy(lot);
  emitToBusiness(lot.businessId, SOCKET_EVENTS.OCCUPANCY_UPDATED, occupancy);
  return occupancy;
}

interface LotInput {
  name: string;
  address?: string;
  capacity: CapacityEntry[];
  pricing: PricingRule[];
  operatingHours: OperatingHours;
}

export async function createLot(user: AuthUser, input: LotInput) {
  const businessId = requireBusiness(user);
  const lot = await prisma.parkingLot.create({
    data: {
      businessId,
      name: input.name,
      address: input.address,
      capacity: input.capacity as object[],
      pricing: input.pricing as object[],
      operatingHours: input.operatingHours as object,
    },
  });
  logActivity({
    user,
    businessId,
    lotId: lot.id,
    action: 'LOT_CREATED',
    description: `${lot.name} created`,
    entityType: 'ParkingLot',
    entityId: lot.id,
  });
  return serializeLot(lot);
}

export async function listLots(user: AuthUser) {
  const businessId = requireBusiness(user);
  const scope = lotScopeFilter(user, 'id');
  const lots = await prisma.parkingLot.findMany({
    where: { businessId, ...scope },
    orderBy: { createdAt: 'asc' },
  });

  const activeCounts = await prisma.parkingSession.groupBy({
    by: ['lotId'],
    where: { businessId, status: 'ACTIVE' },
    _count: { _all: true },
  });
  const occupiedByLot = new Map(
    activeCounts.map((entry) => [entry.lotId, entry._count._all])
  );

  return lots.map((lot) => {
    const occupied = occupiedByLot.get(lot.id) ?? 0;
    return serializeLot(lot, {
      occupied,
      available: Math.max(0, totalCapacity(lot) - occupied),
    });
  });
}

export async function getLotDetail(user: AuthUser, lotId: string) {
  const lot = await getLotOrFail(user, lotId);
  const occupancy = await computeOccupancy(lot);
  return serializeLot(lot, { occupancy });
}

export async function updateLot(
  user: AuthUser,
  lotId: string,
  update: Partial<LotInput> & { isActive?: boolean }
) {
  const lot = await getLotOrFail(user, lotId);

  const pricingChanged = update.pricing !== undefined;
  if (pricingChanged && user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw AppError.forbidden('Only the owner can change pricing');
  }

  const updated = await prisma.parkingLot.update({
    where: { id: lot.id },
    data: {
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.address !== undefined ? { address: update.address } : {}),
      ...(update.capacity !== undefined
        ? { capacity: update.capacity as object[] }
        : {}),
      ...(update.pricing !== undefined ? { pricing: update.pricing as object[] } : {}),
      ...(update.operatingHours !== undefined
        ? { operatingHours: update.operatingHours as object }
        : {}),
      ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
    },
  });

  logActivity({
    user,
    businessId: lot.businessId,
    lotId: lot.id,
    action: 'LOT_UPDATED',
    description: pricingChanged
      ? `${updated.name} pricing updated`
      : `${updated.name} updated`,
    entityType: 'ParkingLot',
    entityId: lot.id,
  });
  return getLotDetail(user, lot.id);
}
