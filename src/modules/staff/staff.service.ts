import type { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/types';
import { asJson } from '../../common/types/domain';
import { requireBusiness } from '../../common/utils/lot-access';
import { logActivity } from '../activity/activity.service';
import { hashPassword } from '../auth/auth.service';

interface CreateStaffInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: 'MANAGER' | 'ATTENDANT';
  assignedLotIds: string[];
}

function serializeStaff(user: User) {
  return {
    id: user.id,
    _id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? undefined,
    role: user.role,
    assignedLotIds: asJson<string[]>(user.assignedLots, []),
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

async function assertLotsBelongToBusiness(
  businessId: string,
  lotIds: string[]
): Promise<void> {
  if (lotIds.length === 0) return;
  const count = await prisma.parkingLot.count({
    where: { id: { in: lotIds }, businessId },
  });
  if (count !== lotIds.length) {
    throw AppError.badRequest('One or more parking lots do not belong to this business');
  }
}

export async function createStaff(user: AuthUser, input: CreateStaffInput) {
  const businessId = requireBusiness(user);

  // Managers can onboard attendants; only owners can create managers.
  if (user.role === 'MANAGER' && input.role !== 'ATTENDANT') {
    throw AppError.forbidden('Managers can only create attendant accounts');
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }
  await assertLotsBelongToBusiness(businessId, input.assignedLotIds);

  const staff = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      password: await hashPassword(input.password),
      authProvider: 'EMAIL',
      role: input.role,
      businessId,
      assignedLots: input.assignedLotIds,
    },
  });

  logActivity({
    user,
    businessId,
    action: 'STAFF_CREATED',
    description: `${staff.fullName} added as ${staff.role.toLowerCase()}`,
    entityType: 'User',
    entityId: staff.id,
  });

  return serializeStaff(staff);
}

export async function listStaff(user: AuthUser) {
  const businessId = requireBusiness(user);
  const staff = await prisma.user.findMany({
    where: { businessId, role: { in: ['MANAGER', 'ATTENDANT'] } },
    orderBy: { createdAt: 'asc' },
  });
  return staff.map(serializeStaff);
}

export async function updateStaff(
  user: AuthUser,
  staffId: string,
  update: {
    fullName?: string;
    phone?: string;
    role?: 'MANAGER' | 'ATTENDANT';
    assignedLotIds?: string[];
    isActive?: boolean;
  }
) {
  const businessId = requireBusiness(user);
  const staff = await prisma.user.findFirst({
    where: { id: staffId, businessId, role: { in: ['MANAGER', 'ATTENDANT'] } },
  });
  if (!staff) throw AppError.notFound('Staff member not found');

  if (user.role === 'MANAGER') {
    if (staff.role === 'MANAGER' || update.role === 'MANAGER') {
      throw AppError.forbidden('Managers can only manage attendant accounts');
    }
  }

  if (update.assignedLotIds) {
    await assertLotsBelongToBusiness(businessId, update.assignedLotIds);
  }

  const updated = await prisma.user.update({
    where: { id: staff.id },
    data: {
      ...(update.fullName !== undefined ? { fullName: update.fullName } : {}),
      ...(update.phone !== undefined ? { phone: update.phone } : {}),
      ...(update.role !== undefined ? { role: update.role } : {}),
      ...(update.assignedLotIds !== undefined
        ? { assignedLots: update.assignedLotIds }
        : {}),
      ...(update.isActive !== undefined
        ? {
            isActive: update.isActive,
            // Deactivation revokes every signed-in session.
            ...(update.isActive ? {} : { refreshTokenHashes: [] }),
          }
        : {}),
    },
  });

  logActivity({
    user,
    businessId,
    action: 'STAFF_UPDATED',
    description: `${updated.fullName}'s account updated`,
    entityType: 'User',
    entityId: updated.id,
  });

  return serializeStaff(updated);
}
