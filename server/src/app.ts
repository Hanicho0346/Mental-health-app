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
import notificationRoutes from './routes/notificationRoutes.js';
import doctorRoutes from './routes/doctor.routes.js';
import chatRoutes from './routes/chatRoutes.js';
import groupChatRoutes from './routes/groupChat.routes.js';
import psychiatristRoutes from './modules/psychiatrist/psychiatrist.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import bookingRoute from "./controllers/bookingRoute.js"
import conversationRoutes from "./controllers/conversation.Routes.js";
import cron from 'node-cron';
import { resetDailyAiUsage } from './utils/resetDailyAiUsage.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import aichat from './routes/aichat.js';
import { healthHandler, readyHandler } from './routes/health.js';
import { paymentReturnHandler, paymentReturnScript } from './routes/paymentReturn.js';
export function createApp() {
  const app = express();

  /** Avoid 304 Not Modified + empty body for JSON `/api/*` routes (clients expect a body). */
  app.set('etag', false);
  app.set('trust proxy', 1);

  app.use(helmetMiddleware());
  app.use(compressionMiddleware());
  app.use(
    cors({
      origin:
        env.nodeEnv === 'production'
          ? env.corsOrigins && env.corsOrigins.length > 0
            ? env.corsOrigins
            : false
          : env.corsOrigins && env.corsOrigins.length > 0
          ? env.corsOrigins
          : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'X-Requested-With'],
    })
  );
  app.use(express.json({ limit: '512kb' }));
  app.use(mongoSanitizeMiddleware());
  app.set('trust proxy', 1);
  app.use(globalRateLimiter());
  app.use(requestLogger);

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler);

  // Chapa redirects here after payment — shows a page so the user can return to the app
  app.get('/payment-return', paymentReturnHandler);
  app.get('/payment-return.js', paymentReturnScript);
  cron.schedule('0 21 * * *', () => {
  void resetDailyAiUsage();
}, { timezone: 'Africa/Addis_Ababa' });

  app.use('/api/auth', authRoutes);
 
  app.use('/api/psychiatrist', psychiatristRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/config', configRoutes);
  app.use("/api/conversations", conversationRoutes);

app.use('/api/users', userRoutes);
   app.use('/api/messages', messageRoutes);
   app.use('/api/notifications', notificationRoutes);
  app.use('/api/bookings', bookingRoute);
  app.use('/api/subscriptions', subscriptionRoutes);
  
  app.use('/api/appointments', appointmentRoutes);
 app.use('/api/doctor', doctorRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/group-chats', groupChatRoutes);
  app.use('/api/ai-chat', aichat); // For AI chat features that might be added later

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
