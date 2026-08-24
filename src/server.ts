import http from 'http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './common/utils/logger';
import { initSocket } from './socket';

async function main(): Promise<void> {
  // 1. Bind the port FIRST. Azure App Service kills the container (and serves
  //    503 forever) if nothing answers its HTTP ping within the startup window.
  //    Nothing slow or failure-prone may run before this.
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // 2. Connect to MySQL afterwards. A DB outage or a missing IP whitelist now
  //    produces a readable error in the log stream instead of a silent 503,
  //    and /health stays up so you can tell "app down" from "database down".
  try {
    await connectDatabase();
  } catch (error) {
    logger.error('Database connection failed — API is up, DB routes will error', error);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});