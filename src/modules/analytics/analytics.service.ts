import { prisma } from '../../config/database';
import { AuthUser } from '../../common/types';
import { CapacityEntry, asJson } from '../../common/types/domain';
import { daysAgo, localDateKey, localDayRange, localHour } from '../../common/utils/dates';
import { requireBusiness } from '../../common/utils/lot-access';

/** The numbers behind the home screen: live status plus today's essentials. */
export async function overview(user: AuthUser, lotId?: string) {
  const businessId = requireBusiness(user);
  const { start, end } = localDayRange();
  const now = new Date();
  const lotFilter = lotId ? { lotId } : {};

  const [
    todayRevenueAgg,
    vehiclesServed,
    currentlyParked,
    avgDurationAgg,
    lots,
    activePasses,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        businessId,
        ...lotFilter,
        status: 'PAID',
        paidAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    }),
    prisma.parkingSession.count({
      where: { businessId, ...lotFilter, entryTime: { gte: start, lt: end } },
    }),
    prisma.parkingSession.count({
      where: { businessId, ...lotFilter, status: 'ACTIVE' },
    }),
    prisma.parkingSession.aggregate({
      where: {
        businessId,
        ...lotFilter,
        status: 'COMPLETED',
        exitTime: { gte: start, lt: end },
      },
      _avg: { durationMinutes: true },
    }),
    prisma.parkingLot.findMany({
      where: { businessId, isActive: true, ...(lotId ? { id: lotId } : {}) },
      select: { capacity: true },
    }),
    prisma.monthlyPass.count({
      where: {
        businessId,
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
  ]);

  const capacity = lots.reduce(
    (sum, lot) =>
      sum +
      asJson<CapacityEntry[]>(lot.capacity, []).reduce(
        (lotSum, entry) => lotSum + entry.spaces,
        0
      ),
    0
  );

  return {
    todayRevenue: todayRevenueAgg._sum.amount ?? 0,
    vehiclesServedToday: vehiclesServed,
    currentlyParked,
    capacity,
    available: Math.max(0, capacity - currentlyParked),
    avgDurationMinutesToday: Math.round(avgDurationAgg._avg.durationMinutes ?? 0),
    activePasses,
  };
}

export async function trends(user: AuthUser, days: number, lotId?: string) {
  const businessId = requireBusiness(user);
  const start = localDayRange(localDateKey(daysAgo(days - 1))).start;
  const lotFilter = lotId ? { lotId } : {};

  const [payments, sessions] = await Promise.all([
    prisma.payment.findMany({
      where: { businessId, ...lotFilter, status: 'PAID', paidAt: { gte: start } },
      select: { amount: true, paidAt: true },
    }),
    prisma.parkingSession.findMany({
      where: { businessId, ...lotFilter, entryTime: { gte: start } },
      select: { entryTime: true },
    }),
  ]);

  const series = new Map<string, { revenue: number; sessions: number }>();
  for (let i = 0; i < days; i += 1) {
    const key = localDateKey(new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
    series.set(key, { revenue: 0, sessions: 0 });
  }
  for (const payment of payments) {
    const day = series.get(localDateKey(payment.paidAt));
    if (day) day.revenue += payment.amount;
  }
  for (const session of sessions) {
    const day = series.get(localDateKey(session.entryTime));
    if (day) day.sessions += 1;
  }

  return [...series.entries()].map(([date, values]) => ({ date, ...values }));
}

/** Entry volume by hour of day over a trailing window — surfaces peak hours. */
export async function peakHours(user: AuthUser, days: number, lotId?: string) {
  const businessId = requireBusiness(user);
  const sessions = await prisma.parkingSession.findMany({
    where: {
      businessId,
      ...(lotId ? { lotId } : {}),
      entryTime: { gte: daysAgo(days) },
    },
    select: { entryTime: true },
  });

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, entries: 0 }));
  for (const session of sessions) {
    const bucket = hours[localHour(session.entryTime)];
    if (bucket) bucket.entries += 1;
  }
  return hours;
}
