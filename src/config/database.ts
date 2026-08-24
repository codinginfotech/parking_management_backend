import { PrismaClient } from '@prisma/client';
import { logger } from '../common/utils/logger';

export const prisma = new PrismaClient();

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('MySQL connected (Prisma)');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
