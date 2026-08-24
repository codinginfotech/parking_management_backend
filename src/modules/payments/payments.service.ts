import crypto from 'crypto';
import type { Payment, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { PaymentMethod, SOCKET_EVENTS } from '../../common/constants';
import { AuthUser, Pagination } from '../../common/types';
import { localDayRange } from '../../common/utils/dates';
import { lotScopeFilter, requireBusiness } from '../../common/utils/lot-access';
import { formatPlate } from '../../common/utils/vehicle-number';
import { emitToBusiness } from '../../socket';
import { logActivity } from '../activity/activity.service';
import * as shiftsService from '../shifts/shifts.service';

function generateReceiptNumber(): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `R-${time}-${random}`;
}

interface SessionPaymentInput {
  user: AuthUser;
  businessId: string;
  lotId: string;
  sessionId: string;
  vehicleNumber: string;
  amount: number;
  method: PaymentMethod;
  transactionRef?: string;
}

/**
 * Records a completed session payment, ties it to the collector's open shift,
 * and broadcasts it. Payment providers (UPI gateways etc.) can later create
 * PENDING payments and confirm them without touching callers of this function.
 */
export async function createSessionPayment(
  input: SessionPaymentInput
): Promise<Payment> {
  const shiftId = await shiftsService.recordCollection(
    input.user.id,
    input.method,
    input.amount
  );

  const payment = await prisma.payment.create({
    data: {
      businessId: input.businessId,
      lotId: input.lotId,
      sessionId: input.sessionId,
      amount: input.amount,
      method: input.method,
      status: 'PAID',
      collectedById: input.user.id,
      shiftId: shiftId ?? undefined,
      transactionRef: input.transactionRef,
      receiptNumber: generateReceiptNumber(),
    },
  });

  logActivity({
    user: input.user,
    businessId: input.businessId,
    lotId: input.lotId,
    action: 'PAYMENT_COLLECTED',
    description: `₹${input.amount} collected via ${input.method} for ${formatPlate(input.vehicleNumber)}`,
    entityType: 'Payment',
    entityId: payment.id,
    meta: { amount: input.amount, method: input.method },
  });

  emitToBusiness(input.businessId, SOCKET_EVENTS.PAYMENT_RECEIVED, {
    paymentId: payment.id,
    lotId: input.lotId,
    amount: input.amount,
    method: input.method,
    vehicleNumber: input.vehicleNumber,
    paidAt: payment.paidAt,
  });

  return payment;
}

export async function listPayments(
  user: AuthUser,
  filters: { lotId?: string; method?: PaymentMethod; date?: string },
  pagination: Pagination
) {
  const businessId = requireBusiness(user);
  const where: Prisma.PaymentWhereInput = {
    businessId,
    ...lotScopeFilter(user, 'lotId'),
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.method ? { method: filters.method } : {}),
  };
  if (filters.date) {
    const { start, end } = localDayRange(filters.date);
    where.paidAt = { gte: start, lt: end };
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        collectedBy: { select: { fullName: true } },
        session: {
          select: { vehicleNumber: true, vehicleType: true, durationMinutes: true },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  const items = payments.map((payment) => ({
    _id: payment.id,
    id: payment.id,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    receiptNumber: payment.receiptNumber,
    transactionRef: payment.transactionRef ?? undefined,
    paidAt: payment.paidAt,
    collectedBy: payment.collectedBy,
    session: payment.session ?? undefined,
  }));

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function paymentSummary(
  user: AuthUser,
  filters: { lotId?: string; from: Date; to: Date }
) {
  const businessId = requireBusiness(user);
  const byMethod = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      businessId,
      status: 'PAID',
      paidAt: { gte: filters.from, lt: filters.to },
      ...(filters.lotId ? { lotId: filters.lotId } : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const total = byMethod.reduce((sum, entry) => sum + (entry._sum.amount ?? 0), 0);
  return {
    total,
    count: byMethod.reduce((sum, entry) => sum + entry._count._all, 0),
    byMethod: byMethod.map((entry) => ({
      method: entry.method,
      total: entry._sum.amount ?? 0,
      count: entry._count._all,
    })),
  };
}
