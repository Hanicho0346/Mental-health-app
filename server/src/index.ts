import { createServer } from 'node:http';
import { createApp, setSocketIo } from './app.js';
import { connectDb } from './database/connection.js';
import { env } from './config/env.js';
import { configureCloudinary } from './services/cloudinary.service.js';
import { isEmailConfigured, verifyEmailTransport, warnIfVerificationEmailDisabled } from './services/email.service.js';
import { createSocketServer } from './sockets/registerSocket.js';
import { logServerError } from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  logServerError('process.unhandledRejection', reason);
});

async function main(): Promise<void> {
  configureCloudinary();
  warnIfVerificationEmailDisabled();
  if (isEmailConfigured()) {
    try {
      await verifyEmailTransport();
      console.log('[email] SMTP ready — verification codes will be sent to each user’s registered email');
    } catch (err) {
      logServerError('email: SMTP verify failed — fix SMTP_USER / SMTP_PASS in .env', err);
    }
  }
  await connectDb();
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);
  setSocketIo(app, io);

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[FATAL] Port ${env.port} is already in use (EADDRINUSE).\n` +
          `  • Stop the other server (other terminal: Ctrl+C), or\n` +
          `  • Windows: run  netstat -ano | findstr :${env.port}  then  taskkill /PID <pid> /F\n` +
          `  • Or set PORT=4001 in .env and restart (update EXPO_PUBLIC_API_URL on the client).`
      );
    } else {
      logServerError('httpServer.listen', err, { port: env.port });
    }
    process.exit(1);
  });

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`HTTP + Socket.IO listening on http://0.0.0.0:${env.port} (all interfaces)`);
  });
}

main().catch((err) => {
  logServerError('main()', err);
  process.exit(1);
});
