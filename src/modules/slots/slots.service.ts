import type { ParkingSlot } from '@prisma/client';
import { prisma } from '../../config/database';
import { SlotStatus, VehicleType } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/types';
import { getLotOrFail } from '../parking-lots/parking-lots.service';

function serializeSlot(
  slot: ParkingSlot & {
    activeSession?: {
      vehicleNumber: string;
      vehicleType: string;
      entryTime: Date;
    } | null;
  }
) {
  return {
    _id: slot.id,
    id: slot.id,
    code: slot.code,
    vehicleType: slot.vehicleType ?? undefined,
    status: slot.status,
    activeSession: slot.activeSession ?? undefined,
  };
}

export async function listSlots(user: AuthUser, lotId: string, status?: SlotStatus) {
  const lot = await getLotOrFail(user, lotId);
  const slots = await prisma.parkingSlot.findMany({
    where: { lotId: lot.id, ...(status ? { status } : {}) },
    orderBy: { code: 'asc' },
    include: {
      activeSession: {
        select: { vehicleNumber: true, vehicleType: true, entryTime: true },
      },
    },
  });
  return slots.map(serializeSlot);
}

export async function createSlot(
  user: AuthUser,
  input: { lotId: string; code: string; vehicleType?: VehicleType }
) {
  const lot = await getLotOrFail(user, input.lotId);
  const code = input.code.toUpperCase();
  const existing = await prisma.parkingSlot.findUnique({
    where: { lotId_code: { lotId: lot.id, code } },
  });
  if (existing) {
    throw AppError.conflict(`Slot ${code} already exists at ${lot.name}`);
  }
  const slot = await prisma.parkingSlot.create({
    data: {
      businessId: lot.businessId,
      lotId: lot.id,
      code,
      vehicleType: input.vehicleType,
    },
  });
  return serializeSlot(slot);
}

export async function createSlotsBulk(
  user: AuthUser,
  input: {
    lotId: string;
    prefix: string;
    from: number;
    to: number;
    vehicleType?: VehicleType;
  }
) {
  const lot = await getLotOrFail(user, input.lotId);
  const codes = [];
  for (let n = input.from; n <= input.to; n += 1) {
    codes.push(`${input.prefix.toUpperCase()}-${n}`);
  }

  const existing = await prisma.parkingSlot.findMany({
    where: { lotId: lot.id, code: { in: codes } },
    select: { code: true },
  });
  const existingSet = new Set(existing.map((slot) => slot.code));
  const toCreate = codes.filter((code) => !existingSet.has(code));

  if (toCreate.length === 0) {
    throw AppError.conflict('All slots in this range already exist');
  }

  const created = await prisma.parkingSlot.createMany({
    data: toCreate.map((code) => ({
      businessId: lot.businessId,
      lotId: lot.id,
      code,
      vehicleType: input.vehicleType,
    })),
    skipDuplicates: true,
  });
  return { created: created.count, skipped: codes.length - toCreate.length };
}

export async function updateSlot(
  user: AuthUser,
  slotId: string,
  update: {
    status?: Extract<SlotStatus, 'AVAILABLE' | 'BLOCKED'>;
    vehicleType?: VehicleType | null;
  }
) {
  const slot = await prisma.parkingSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw AppError.notFound('Slot not found');
  await getLotOrFail(user, slot.lotId);

  if (slot.status === 'OCCUPIED' && update.status) {
    throw AppError.conflict('An occupied slot cannot be changed. Exit the vehicle first.');
  }
  const updated = await prisma.parkingSlot.update({
    where: { id: slot.id },
    data: {
      ...(update.status ? { status: update.status } : {}),
      ...(update.vehicleType !== undefined
        ? { vehicleType: update.vehicleType ?? null }
        : {}),
    },
  });
  return serializeSlot(updated);
}

export async function deleteSlot(user: AuthUser, slotId: string): Promise<void> {
  const slot = await prisma.parkingSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw AppError.notFound('Slot not found');
  await getLotOrFail(user, slot.lotId);
  if (slot.status === 'OCCUPIED') {
    throw AppError.conflict('An occupied slot cannot be deleted');
  }
  await prisma.parkingSlot.delete({ where: { id: slot.id } });
}
