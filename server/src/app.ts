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
import clerkRoutes from './modules/clerk/clerk.routes.js';
import psychiatristRoutes from './modules/psychiatrist/psychiatrist.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import bookingRoute from "./controllers/bookingRoute.js"
import conversationRoutes from "./controllers/conversation.Routes.js";
import cron from 'node-cron';
import { resetDailyAiUsage } from './utils/resetDailyAiUsage.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import aichat from './routes/aichat.js';
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
  app.set('trust proxy', 1);
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

  // Chapa redirects here after payment — shows a simple page so the user can return to the app
  app.get('/payment-return', (req, res) => {
    const tx_ref = (req.query.trx_ref ?? req.query.tx_ref ?? '') as string;
    const deepLink = tx_ref
      ? `mental-health-mobile://payment-return?tx_ref=${encodeURIComponent(tx_ref)}`
      : `mental-health-mobile://`;
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Complete</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;color:#111827}.card{background:#fff;border-radius:20px;padding:40px 32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px;width:90%}h1{color:#16a34a;font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:15px;line-height:1.6}.ref{font-size:12px;color:#9ca3af;margin-top:16px;word-break:break-all}.btn{display:inline-block;margin-top:24px;background:#16a34a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:16px;font-weight:700}</style><script>setTimeout(function(){window.location.href=\"${deepLink}\"},2000);</script></head><body><div class="card"><div style="font-size:52px">✅</div><h1>Payment Complete</h1><p>Returning you to the SelamMind app…</p>${tx_ref ? `<p class="ref">Ref: ${tx_ref}</p>` : ''}<a class=\"btn\" href=\"${deepLink}\">Open App →</a></div></body></html>`);
  });
  cron.schedule('0 21 * * *', () => {
  void resetDailyAiUsage();
}, { timezone: 'Africa/Addis_Ababa' });

   app.use('/api/auth/clerk', clerkRoutes);
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
