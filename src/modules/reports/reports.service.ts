import { prisma } from '../../config/database';
import { AuthUser } from '../../common/types';
import { localDateKey, localDayRange } from '../../common/utils/dates';
import { requireBusiness } from '../../common/utils/lot-access';

export async function dailyReport(user: AuthUser, date?: string, lotId?: string) {
  const businessId = requireBusiness(user);
  const { start, end } = localDayRange(date);
  const lotFilter = lotId ? { lotId } : {};
  const paymentWhere = {
    businessId,
    ...lotFilter,
    status: 'PAID',
    paidAt: { gte: start, lt: end },
  };
  const entryWhere = { businessId, ...lotFilter, entryTime: { gte: start, lt: end } };

  const [revenueAgg, methodAgg, entries, completedAgg, vehicleAgg, staffAgg] =
    await Promise.all([
      prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['method'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.parkingSession.count({ where: entryWhere }),
      prisma.parkingSession.aggregate({
        where: {
          businessId,
          ...lotFilter,
          status: 'COMPLETED',
          exitTime: { gte: start, lt: end },
        },
        _avg: { durationMinutes: true },
        _count: { _all: true },
      }),
      prisma.parkingSession.groupBy({
        by: ['vehicleType'],
        where: entryWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ['collectedById'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
    ]);

  const staffIds = staffAgg.map((entry) => entry.collectedById);
  const staffUsers = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const staffNames = new Map(staffUsers.map((staff) => [staff.id, staff.fullName]));

  return {
    date: localDateKey(start),
    range: { start, end },
    revenue: revenueAgg._sum.amount ?? 0,
    paymentsCount: revenueAgg._count._all,
    vehiclesEntered: entries,
    vehiclesExited: completedAgg._count._all,
    avgDurationMinutes: Math.round(completedAgg._avg.durationMinutes ?? 0),
    methodBreakdown: methodAgg.map((entry) => ({
      method: entry.method,
      total: entry._sum.amount ?? 0,
      count: entry._count._all,
    })),
    vehicleTypeBreakdown: vehicleAgg.map((entry) => ({
      vehicleType: entry.vehicleType,
      count: entry._count._all,
      revenue: entry._sum.amount ?? 0,
    })),
    staffCollections: staffAgg.map((entry) => ({
      staffId: entry.collectedById,
      name: staffNames.get(entry.collectedById) ?? 'Unknown',
      total: entry._sum.amount ?? 0,
      count: entry._count._all,
    })),
  };
}

export async function rangeReport(
  user: AuthUser,
  from: string,
  to: string,
  lotId?: string
) {
  const businessId = requireBusiness(user);
  const { start } = localDayRange(from);
  const { end } = localDayRange(to);
  const lotFilter = lotId ? { lotId } : {};

  const [payments, sessions] = await Promise.all([
    prisma.payment.findMany({
      where: {
        businessId,
        ...lotFilter,
        status: 'PAID',
        paidAt: { gte: start, lt: end },
      },
      select: { amount: true, paidAt: true },
    }),
    prisma.parkingSession.findMany({
      where: { businessId, ...lotFilter, entryTime: { gte: start, lt: end } },
      select: { entryTime: true },
    }),
  ]);

  // Group by local calendar day in application code — keeps the timezone
  // rollover logic in one place (dates.ts) instead of duplicated in SQL.
  const days = new Map<string, { revenue: number; sessions: number }>();
  for (
    let cursor = start.getTime();
    cursor < end.getTime();
    cursor += 24 * 60 * 60 * 1000
  ) {
    days.set(localDateKey(new Date(cursor)), { revenue: 0, sessions: 0 });
  }
  for (const payment of payments) {
    const day = days.get(localDateKey(payment.paidAt));
    if (day) day.revenue += payment.amount;
  }
  for (const session of sessions) {
    const day = days.get(localDateKey(session.entryTime));
    if (day) day.sessions += 1;
  }

  const series = [...days.entries()].map(([date, values]) => ({ date, ...values }));
  return {
    from,
    to,
    totalRevenue: series.reduce((sum, day) => sum + day.revenue, 0),
    totalSessions: series.reduce((sum, day) => sum + day.sessions, 0),
    series,
  };
}
