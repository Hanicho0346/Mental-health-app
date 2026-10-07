"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.setSocketIo = setSocketIo;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const env_js_1 = require("./config/env.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const rateLimit_js_1 = require("./middleware/rateLimit.js");
const requestLogger_js_1 = require("./middleware/requestLogger.js");
const security_js_1 = require("./middleware/security.js");
const appointmentRoutes_js_1 = __importDefault(require("./routes/appointmentRoutes.js"));
const authRoutes_js_1 = __importDefault(require("./routes/authRoutes.js"));
const configRoutes_js_1 = __importDefault(require("./routes/configRoutes.js"));
const messageRoutes_js_1 = __importDefault(require("./routes/messageRoutes.js"));
const userRoutes_js_1 = __importDefault(require("./routes/userRoutes.js"));
const notificationRoutes_js_1 = __importDefault(require("./routes/notificationRoutes.js"));
const doctor_routes_js_1 = __importDefault(require("./routes/doctor.routes.js"));
const chatRoutes_js_1 = __importDefault(require("./routes/chatRoutes.js"));
const psychiatrist_routes_js_1 = __importDefault(require("./modules/psychiatrist/psychiatrist.routes.js"));
const admin_routes_js_1 = __importDefault(require("./modules/admin/admin.routes.js"));
const bookingRoute_js_1 = __importDefault(require("./controllers/bookingRoute.js"));
const conversation_Routes_js_1 = __importDefault(require("./controllers/conversation.Routes.js"));
const node_cron_1 = __importDefault(require("node-cron"));
const resetDailyAiUsage_js_1 = require("./utils/resetDailyAiUsage.js");
const subscription_routes_js_1 = __importDefault(require("./routes/subscription.routes.js"));
const aichat_js_1 = __importDefault(require("./routes/aichat.js"));
const health_js_1 = require("./routes/health.js");
const paymentReturn_js_1 = require("./routes/paymentReturn.js");
function createApp() {
    const app = (0, express_1.default)();
    /** Avoid 304 Not Modified + empty body for JSON `/api/*` routes (clients expect a body). */
    app.set('etag', false);
    app.use((0, security_js_1.helmetMiddleware)());
    app.use((0, security_js_1.compressionMiddleware)());
    app.use((0, cors_1.default)({
        origin: env_js_1.env.corsOrigins && env_js_1.env.corsOrigins.length > 0 ? env_js_1.env.corsOrigins : true,
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '512kb' }));
    app.use((0, security_js_1.mongoSanitizeMiddleware)());
    app.use((0, rateLimit_js_1.globalRateLimiter)());
    app.use(requestLogger_js_1.requestLogger);
    app.use('/api', (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        next();
    });
    app.get('/health', health_js_1.healthHandler);
    app.get('/ready', health_js_1.readyHandler);
    // Chapa redirects here after payment — shows a page so the user can return to the app
    app.get('/payment-return', paymentReturn_js_1.paymentReturnHandler);
    app.get('/payment-return.js', paymentReturn_js_1.paymentReturnScript);
    node_cron_1.default.schedule('0 21 * * *', () => {
        void (0, resetDailyAiUsage_js_1.resetDailyAiUsage)();
    }, { timezone: 'Africa/Addis_Ababa' });
    app.use('/api/auth', authRoutes_js_1.default);
    app.use('/api/psychiatrist', psychiatrist_routes_js_1.default);
    app.use('/api/admin', admin_routes_js_1.default);
    app.use('/api/config', configRoutes_js_1.default);
    app.use("/api/conversations", conversation_Routes_js_1.default);
    app.use('/api/users', userRoutes_js_1.default);
    app.use('/api/messages', messageRoutes_js_1.default);
    app.use('/api/notifications', notificationRoutes_js_1.default);
    app.use('/api/bookings', bookingRoute_js_1.default);
    app.use('/api/subscriptions', subscription_routes_js_1.default);
    app.use('/api/appointments', appointmentRoutes_js_1.default);
    app.use('/api/doctor', doctor_routes_js_1.default);
    app.use('/api/chat', chatRoutes_js_1.default);
    app.use('/api/ai-chat', aichat_js_1.default); // For AI chat features that might be added later
    app.use((_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
    app.use(errorHandler_js_1.errorHandler);
    return app;
}
/** Call after `io` is created: `app.set('io', io)`. */
function setSocketIo(app, io) {
    app.set('io', io);
}
