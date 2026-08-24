import { prisma } from '../../config/database';
import { AuthUser } from '../../common/types';
import { CapacityEntry, asJson } from '../../common/types/domain';
import { requireBusiness } from '../../common/utils/lot-access';
import { formatPlate } from '../../common/utils/vehicle-number';

export interface Notification {
  id: string;
  type: 'PASS_EXPIRING' | 'LOT_NEAR_CAPACITY' | 'LONG_OPEN_SHIFT';
  severity: 'info' | 'warning';
  title: string;
  message: string;
  at: Date;
}

/**
 * Operational alerts derived live from current data — no stored notification
 * collection to drift out of sync. Push delivery can be layered on later.
 */
export async function getNotifications(user: AuthUser): Promise<Notification[]> {
  const businessId = requireBusiness(user);
  const now = new Date();
  const notifications: Notification[] = [];

  const expiringPasses = await prisma.monthlyPass.findMany({
    where: {
      businessId,
      status: 'ACTIVE',
      endDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { endDate: 'asc' },
    take: 20,
  });
  for (const pass of expiringPasses) {
    const daysLeft = Math.ceil(
      (pass.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    notifications.push({
      id: `pass-${pass.id}`,
      type: 'PASS_EXPIRING',
      severity: 'warning',
      title: 'Pass expiring soon',
      message: `${formatPlate(pass.vehicleNumber)} (${pass.holderName}) expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      at: pass.endDate,
    });
  }

  if (user.role === 'OWNER' || user.role === 'MANAGER' || user.role === 'ADMIN') {
    const lots = await prisma.parkingLot.findMany({
      where: { businessId, isActive: true },
      select: { id: true, name: true, capacity: true },
    });
    const activeCounts = await prisma.parkingSession.groupBy({
      by: ['lotId'],
      where: { businessId, status: 'ACTIVE' },
      _count: { _all: true },
    });
    const occupiedByLot = new Map(
      activeCounts.map((entry) => [entry.lotId, entry._count._all])
    );
    for (const lot of lots) {
      const capacity = asJson<CapacityEntry[]>(lot.capacity, []).reduce(
        (sum, entry) => sum + entry.spaces,
        0
      );
      const occupied = occupiedByLot.get(lot.id) ?? 0;
      if (capacity > 0 && occupied / capacity >= 0.9) {
        notifications.push({
          id: `lot-${lot.id}`,
          type: 'LOT_NEAR_CAPACITY',
          severity: 'warning',
          title: 'Lot almost full',
          message: `${lot.name} is at ${occupied}/${capacity}`,
          at: now,
        });
      }
    }

    const longShifts = await prisma.staffShift.findMany({
      where: {
        businessId,
        status: 'OPEN',
        startTime: { lte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
      include: { staff: { select: { fullName: true } } },
    });
    for (const shift of longShifts) {
      const hours = Math.floor(
        (now.getTime() - shift.startTime.getTime()) / (60 * 60 * 1000)
      );
      notifications.push({
        id: `shift-${shift.id}`,
        type: 'LONG_OPEN_SHIFT',
        severity: 'info',
        title: 'Shift still open',
        message: `${shift.staff?.fullName ?? 'A staff member'}'s shift has been open for ${hours} hours`,
        at: shift.startTime,
      });
    }
  }

  return notifications.sort((a, b) => a.at.getTime() - b.at.getTime());
}
