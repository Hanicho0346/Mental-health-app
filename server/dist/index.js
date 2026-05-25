"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const app_js_1 = require("./app.js");
const connection_js_1 = require("./database/connection.js");
const env_js_1 = require("./config/env.js");
const cloudinary_service_js_1 = require("./services/cloudinary.service.js");
const email_service_js_1 = require("./services/email.service.js");
const registerSocket_js_1 = require("./sockets/registerSocket.js");
const logger_js_1 = require("./utils/logger.js");
process.on('unhandledRejection', (reason) => {
    (0, logger_js_1.logServerError)('process.unhandledRejection', reason);
});
async function main() {
    (0, cloudinary_service_js_1.configureCloudinary)();
    (0, email_service_js_1.warnIfVerificationEmailDisabled)();
    if ((0, email_service_js_1.isEmailConfigured)()) {
        try {
            await (0, email_service_js_1.verifyEmailTransport)();
            console.log('[email] SMTP ready — verification codes will be sent to each user’s registered email');
        }
        catch (err) {
            (0, logger_js_1.logServerError)('email: SMTP verify failed — fix SMTP_USER / SMTP_PASS in .env', err);
        }
    }
    await (0, connection_js_1.connectDb)();
    const app = (0, app_js_1.createApp)();
    const httpServer = (0, node_http_1.createServer)(app);
    const io = (0, registerSocket_js_1.createSocketServer)(httpServer);
    (0, app_js_1.setSocketIo)(app, io);
    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[FATAL] Port ${env_js_1.env.port} is already in use (EADDRINUSE).\n` +
                `  • Stop the other server (other terminal: Ctrl+C), or\n` +
                `  • Windows: run  netstat -ano | findstr :${env_js_1.env.port}  then  taskkill /PID <pid> /F\n` +
                `  • Or set PORT=4001 in .env and restart (update EXPO_PUBLIC_API_URL on the client).`);
        }
        else {
            (0, logger_js_1.logServerError)('httpServer.listen', err, { port: env_js_1.env.port });
        }
        process.exit(1);
    });
    httpServer.listen(env_js_1.env.port, '0.0.0.0', () => {
        console.log(`HTTP + Socket.IO listening on http://0.0.0.0:${env_js_1.env.port} (all interfaces)`);
    });
}
main().catch((err) => {
    (0, logger_js_1.logServerError)('main()', err);
    process.exit(1);
});
