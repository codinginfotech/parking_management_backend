import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ActivityAction } from '../../common/constants';
import { AuthUser, Pagination } from '../../common/types';
import { logger } from '../../common/utils/logger';
import { lotScopeFilter, requireBusiness } from '../../common/utils/lot-access';

interface LogInput {
  user: AuthUser;
  businessId: string;
  lotId?: string;
  action: ActivityAction;
  description: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget — an audit write must never fail the operation it records. */
export function logActivity(input: LogInput): void {
  prisma.activityLog
    .create({
      data: {
        businessId: input.businessId,
        lotId: input.lotId,
        actorId: input.user.id,
        actorName: input.user.fullName,
        action: input.action,
        description: input.description,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta as object | undefined,
      },
    })
    .catch((error) => logger.error('Failed to write activity log', error));
}

export async function listActivity(
  user: AuthUser,
  filters: { lotId?: string; action?: ActivityAction },
  pagination: Pagination
) {
  const businessId = requireBusiness(user);
  const where: Prisma.ActivityLogWhereInput = {
    businessId,
    ...lotScopeFilter(user, 'lotId'),
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return {
    items: logs.map((log) => ({
      _id: log.id,
      id: log.id,
      action: log.action,
      actorName: log.actorName,
      description: log.description,
      createdAt: log.createdAt,
      meta: log.meta ?? undefined,
    })),
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}
