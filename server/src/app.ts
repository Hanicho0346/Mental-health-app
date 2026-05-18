import cors from 'cors';
import express from 'express';
import type { Server as IOServer } from 'socket.io';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { compressionMiddleware, helmetMiddleware, mongoSanitizeMiddleware } from './middleware/security.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import configRoutes from './routes/configRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import userRoutes from './routes/userRoutes.js';
import doctorRoutes from './routes/doctor.routes.js';
export function createApp() {
  const app = express();

  /** Avoid 304 Not Modified + empty body for JSON `/api/*` routes (clients expect a body). */
  app.set('etag', false);

  app.use(helmetMiddleware());
  app.use(compressionMiddleware());
  app.use(
    cors({
      origin: env.corsOrigins && env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '512kb' }));
  app.use(mongoSanitizeMiddleware());
  app.use(globalRateLimiter());
  app.use(requestLogger);

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/appointments', appointmentRoutes);
 app.use('/api/doctor', doctorRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}

/** Call after `io` is created: `app.set('io', io)`. */
export function setSocketIo(app: ReturnType<typeof createApp>, io: IOServer): void {
  app.set('io', io);
}
