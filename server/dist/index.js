"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const app_js_1 = require("./app.js");
const connection_js_1 = require("./database/connection.js");
const env_js_1 = require("./config/env.js");
const cloudinary_service_js_1 = require("./services/cloudinary.service.js");
const email_service_js_1 = require("./services/email.service.js");
const registerSocket_js_1 = require("./sockets/registerSocket.js");
const redis_client_js_1 = require("./integrations/redis/redis.client.js");
const shutdown_js_1 = require("./shutdown.js");
const logger_js_1 = require("./utils/logger.js");
process.on('unhandledRejection', (reason) => {
    (0, logger_js_1.logServerError)('process.unhandledRejection', reason);
});
async function main() {
    (0, cloudinary_service_js_1.configureCloudinary)();
    (0, email_service_js_1.warnIfVerificationEmailDisabled)();
    await (0, redis_client_js_1.connectRedis)().catch((err) => {
        (0, logger_js_1.logServerWarn)('redis.connect.failed', { message: 'Redis unavailable, proceeding without it.' });
    });
    await (0, email_service_js_1.verifyEmailTransport)();
    await (0, connection_js_1.connectDb)();
    const app = (0, app_js_1.createApp)();
    const httpServer = (0, node_http_1.createServer)(app);
    const io = (0, registerSocket_js_1.createSocketServer)(httpServer);
    (0, app_js_1.setSocketIo)(app, io);
    (0, shutdown_js_1.registerGracefulShutdown)(httpServer, io);
    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            (0, logger_js_1.logServerError)('httpServer.EADDRINUSE', err, { port: env_js_1.env.port });
        }
        else {
            (0, logger_js_1.logServerError)('httpServer.listen', err, { port: env_js_1.env.port });
        }
        process.exit(1);
    });
    httpServer.listen(env_js_1.env.port, '0.0.0.0', () => {
        (0, logger_js_1.logServerInfo)('api.listening', { port: env_js_1.env.port, host: '0.0.0.0' });
    });
}
main().catch((err) => {
    (0, logger_js_1.logServerError)('main()', err);
    process.exit(1);
});
