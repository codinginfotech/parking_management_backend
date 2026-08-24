import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AuthProvider, Role } from '../../common/constants';
import { AppError } from '../../common/errors/app-error';
import { asJson } from '../../common/types/domain';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../common/utils/jwt';
import { AuthResult, SerializedUser } from './auth.types';
import { LoginInput, RegisterInput } from './auth.validation';

const googleClient = new OAuth2Client();
const googleAudiences = env.GOOGLE_CLIENT_ID.split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const MAX_SESSIONS_PER_USER = 5;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function serializeUser(user: User): Promise<SerializedUser> {
  const business = user.businessId
    ? await prisma.business.findUnique({
        where: { id: user.businessId },
        select: { id: true, name: true },
      })
    : null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? undefined,
    profileImage: user.profileImage ?? undefined,
    role: user.role as Role,
    authProvider: user.authProvider as AuthProvider,
    isEmailVerified: user.isEmailVerified,
    assignedLotIds: asJson<string[]>(user.assignedLots, []),
    business,
  };
}

async function issueTokens(user: User, replaceHash?: string): Promise<AuthResult> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role as Role,
    businessId: user.businessId,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  // One hashed refresh token per signed-in device, bounded to the most recent.
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { refreshTokenHashes: true },
  });
  const hashes = asJson<string[]>(current?.refreshTokenHashes, []).filter(
    (hash) => hash !== replaceHash
  );
  hashes.push(hashToken(refreshToken));
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHashes: hashes.slice(-MAX_SESSIONS_PER_USER) },
  });

  return { user: await serializeUser(user), accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  let user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      password: await hashPassword(input.password),
      authProvider: 'EMAIL',
      role: 'OWNER',
    },
  });
  const business = await prisma.business.create({
    data: { name: input.businessName, ownerId: user.id },
  });
  user = await prisma.user.update({
    where: { id: user.id },
    data: { businessId: business.id },
  });

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw AppError.unauthorized('Incorrect email or password');
  }
  if (!user.password) {
    throw AppError.badRequest(
      'This account uses Google sign-in. Continue with Google instead.'
    );
  }
  const matches = await bcrypt.compare(input.password, user.password);
  if (!matches) {
    throw AppError.unauthorized('Incorrect email or password');
  }
  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated. Contact your owner.');
  }
  return issueTokens(user);
}

/**
 * Single endpoint for both Google login and Google signup:
 * verify the ID token, then sign in the matching user or create one.
 */
export async function googleAuth(idToken: string): Promise<AuthResult> {
  if (googleAudiences.length === 0) {
    throw AppError.badRequest('Google sign-in is not configured on this server');
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleAudiences,
    });
    payload = ticket.getPayload();
  } catch {
    throw AppError.unauthorized('Google sign-in could not be verified. Try again.');
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw AppError.unauthorized('Google account has no verified email');
  }

  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

  if (!user) {
    // Link Google to an existing email/password account with the same address.
    const byEmail = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: payload.sub,
          isEmailVerified: true,
          ...(byEmail.profileImage || !payload.picture
            ? {}
            : { profileImage: payload.picture }),
        },
      });
    } else {
      const fullName = payload.name?.trim() || payload.email.split('@')[0] || 'Owner';
      user = await prisma.user.create({
        data: {
          fullName,
          email: payload.email.toLowerCase(),
          profileImage: payload.picture,
          authProvider: 'GOOGLE',
          googleId: payload.sub,
          isEmailVerified: true,
          role: 'OWNER',
        },
      });
      const business = await prisma.business.create({
        data: { name: `${fullName.split(' ')[0]}'s Parking`, ownerId: user.id },
      });
      user = await prisma.user.update({
        where: { id: user.id },
        data: { businessId: business.id },
      });
    }
  }

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated. Contact your owner.');
  }

  return issueTokens(user);
}

export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw AppError.unauthorized('Session expired. Please sign in again.');
  }
  const hash = hashToken(refreshToken);
  const hashes = asJson<string[]>(user.refreshTokenHashes, []);
  if (!hashes.includes(hash)) {
    // Possible token reuse — revoke every session for safety.
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHashes: [] },
    });
    throw AppError.unauthorized('Session expired. Please sign in again.');
  }
  return issueTokens(user, hash);
}

/** Removes the device's refresh token; without one, signs out everywhere. */
export async function logout(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { refreshTokenHashes: true },
    });
    const hash = hashToken(refreshToken);
    const hashes = asJson<string[]>(user?.refreshTokenHashes, []).filter(
      (stored) => stored !== hash
    );
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHashes: hashes },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHashes: [] },
    });
  }
}

export async function getMe(userId: string): Promise<SerializedUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw AppError.unauthorized();
  }
  return serializeUser(user);
}
