import http from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { SocketEvent } from '../common/constants';
import { verifyAccessToken } from '../common/utils/jwt';
import { logger } from '../common/utils/logger';

let io: Server | null = null;

interface SocketAuthData {
  userId: string;
  businessId: string;
}

function businessRoom(businessId: string): string {
  return `business:${businessId}`;
}

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, businessId: true, isActive: true },
      });
      if (!user || !user.isActive || !user.businessId) {
        return next(new Error('Account not active'));
      }
      (socket.data as SocketAuthData).userId = user.id;
      (socket.data as SocketAuthData).businessId = user.businessId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { businessId } = socket.data as SocketAuthData;
    socket.join(businessRoom(businessId));
  });

  logger.info('Socket.IO initialized');
  return io;
}

/**
 * Emits a realtime event to every connected device of a business.
 * Safe to call before initialization (e.g. in scripts/tests) — it becomes a no-op.
 */
export function emitToBusiness(
  businessId: string,
  event: SocketEvent,
  payload: unknown
): void {
  io?.to(businessRoom(businessId)).emit(event, payload);
}
