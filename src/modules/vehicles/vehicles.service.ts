import type { Vehicle } from '@prisma/client';
import { prisma } from '../../config/database';
import { VehicleType } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/types';
import { requireBusiness } from '../../common/utils/lot-access';
import { formatPlate, normalizePlate } from '../../common/utils/vehicle-number';

export async function upsertVehicleOnEntry(
  businessId: string,
  number: string,
  type: VehicleType
): Promise<Vehicle> {
  return prisma.vehicle.upsert({
    where: { businessId_number: { businessId, number } },
    update: { type, lastVisitAt: new Date(), totalVisits: { increment: 1 } },
    create: {
      businessId,
      number,
      type,
      totalVisits: 1,
      lastVisitAt: new Date(),
    },
  });
}

export async function searchVehicles(user: AuthUser, query: string) {
  const businessId = requireBusiness(user);
  const normalized = normalizePlate(query);
  if (normalized.length < 2) return [];

  const vehicles = await prisma.vehicle.findMany({
    where: { businessId, number: { contains: normalized } },
    orderBy: { lastVisitAt: 'desc' },
    take: 15,
  });

  const numbers = vehicles.map((vehicle) => vehicle.number);
  const activeSessions = await prisma.parkingSession.findMany({
    where: { businessId, vehicleNumber: { in: numbers }, status: 'ACTIVE' },
    select: { vehicleNumber: true },
  });
  const activeSet = new Set(activeSessions.map((session) => session.vehicleNumber));

  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    number: vehicle.number,
    displayNumber: formatPlate(vehicle.number),
    type: vehicle.type,
    totalVisits: vehicle.totalVisits,
    lastVisitAt: vehicle.lastVisitAt,
    isParked: activeSet.has(vehicle.number),
  }));
}

export async function getVehicleHistory(user: AuthUser, rawNumber: string) {
  const businessId = requireBusiness(user);
  const number = normalizePlate(rawNumber);
  const vehicle = await prisma.vehicle.findUnique({
    where: { businessId_number: { businessId, number } },
  });
  if (!vehicle) throw AppError.notFound('Vehicle not found');

  const sessions = await prisma.parkingSession.findMany({
    where: { businessId, vehicleNumber: number },
    orderBy: { entryTime: 'desc' },
    take: 50,
    include: { lot: { select: { id: true, name: true } } },
  });

  return {
    vehicle: {
      id: vehicle.id,
      number: vehicle.number,
      displayNumber: formatPlate(vehicle.number),
      type: vehicle.type,
      totalVisits: vehicle.totalVisits,
      lastVisitAt: vehicle.lastVisitAt,
    },
    sessions: sessions.map((session) => ({
      _id: session.id,
      id: session.id,
      lot: { _id: session.lot.id, name: session.lot.name },
      lotName: session.lot.name,
      status: session.status,
      entryTime: session.entryTime,
      exitTime: session.exitTime,
      durationMinutes: session.durationMinutes,
      amount: session.amount,
      coveredByPass: session.coveredByPass,
    })),
  };
}
