import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './common/middleware/error-handler';
import { globalRateLimiter } from './common/middleware/rate-limit';
import { requestLogger } from './common/middleware/request-logger';
import { apiV1 } from './routes';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
  });

  app.use('/api/v1', apiV1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
