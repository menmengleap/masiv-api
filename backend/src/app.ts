import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { apiLimiter } from './middleware/ratelimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'masiv-api', env: config.env });
  });

  app.use('/api', apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
