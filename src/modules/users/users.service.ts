import { prisma } from '../../config/database';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/types';
import { requireBusiness } from '../../common/utils/lot-access';
import { serializeUser } from '../auth/auth.service';
import { SerializedUser } from '../auth/auth.types';

interface ProfileUpdate {
  fullName?: string;
  phone?: string;
  profileImage?: string;
}

interface BusinessUpdate {
  name?: string;
  phone?: string;
  address?: string;
}

export async function updateProfile(
  authUser: AuthUser,
  update: ProfileUpdate
): Promise<SerializedUser> {
  const user = await prisma.user.update({
    where: { id: authUser.id },
    data: {
      ...(update.fullName !== undefined ? { fullName: update.fullName } : {}),
      ...(update.phone !== undefined ? { phone: update.phone } : {}),
      ...(update.profileImage !== undefined ? { profileImage: update.profileImage } : {}),
    },
  });
  return serializeUser(user);
}

export async function updateBusiness(authUser: AuthUser, update: BusinessUpdate) {
  const businessId = requireBusiness(authUser);
  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.phone !== undefined ? { phone: update.phone } : {}),
      ...(update.address !== undefined ? { address: update.address } : {}),
    },
  });
  return {
    id: business.id,
    name: business.name,
    phone: business.phone,
    address: business.address,
  };
}

export async function getBusiness(authUser: AuthUser) {
  const businessId = requireBusiness(authUser);
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw AppError.notFound('Business not found');
  return {
    id: business.id,
    name: business.name,
    phone: business.phone,
    address: business.address,
    createdAt: business.createdAt,
  };
}
