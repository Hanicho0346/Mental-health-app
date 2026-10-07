import { createServer } from 'node:http';
import { createApp, setSocketIo } from './app.js';
import { connectDb } from './database/connection.js';
import { env } from './config/env.js';
import { configureCloudinary } from './services/cloudinary.service.js';
import { verifyEmailTransport, warnIfVerificationEmailDisabled } from './services/email.service.js';
import { createSocketServer } from './sockets/registerSocket.js';
import { connectRedis } from './integrations/redis/redis.client.js';
import { registerGracefulShutdown } from './shutdown.js';
import { logServerError, logServerInfo, logServerWarn } from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  logServerError('process.unhandledRejection', reason);
});

async function main(): Promise<void> {
  configureCloudinary();
  warnIfVerificationEmailDisabled();

  await connectRedis().catch((err: unknown) => {
    logServerWarn('redis.connect.failed', { message: 'Redis unavailable, proceeding without it.' });
  });
  await verifyEmailTransport();
  await connectDb();

  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);
  setSocketIo(app, io);

  registerGracefulShutdown(httpServer, io);

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logServerError('httpServer.EADDRINUSE', err, { port: env.port });
    } else {
      logServerError('httpServer.listen', err, { port: env.port });
    }
    process.exit(1);
  });

  httpServer.listen(env.port, '0.0.0.0', () => {
    logServerInfo('api.listening', { port: env.port, host: '0.0.0.0' });
  });
}

main().catch((err) => {
  logServerError('main()', err);
  process.exit(1);
});
