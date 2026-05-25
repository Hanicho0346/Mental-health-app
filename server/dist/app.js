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
const doctor_routes_js_1 = __importDefault(require("./routes/doctor.routes.js"));
const chatRoutes_js_1 = __importDefault(require("./routes/chatRoutes.js"));
const clerk_routes_js_1 = __importDefault(require("./modules/clerk/clerk.routes.js"));
const psychiatrist_routes_js_1 = __importDefault(require("./modules/psychiatrist/psychiatrist.routes.js"));
const admin_routes_js_1 = __importDefault(require("./modules/admin/admin.routes.js"));
const bookingRoute_js_1 = __importDefault(require("./controllers/bookingRoute.js"));
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
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
    // Chapa redirects here after payment — shows a simple page so the user can return to the app
    app.get('/payment-return', (req, res) => {
        const tx_ref = (req.query.trx_ref ?? req.query.tx_ref ?? '');
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Complete</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;color:#111827}.card{background:#fff;border-radius:20px;padding:40px 32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px;width:90%}h1{color:#16a34a;font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:15px;line-height:1.6}.ref{font-size:12px;color:#9ca3af;margin-top:16px;word-break:break-all}</style></head><body><div class="card"><div style="font-size:52px">✅</div><h1>Payment Complete</h1><p>Your session has been booked. Return to the SelamMind app to continue.</p>${tx_ref ? `<p class="ref">Ref: ${tx_ref}</p>` : ''}</div></body></html>`);
    });
    app.use('/api/auth/clerk', clerk_routes_js_1.default);
    app.use('/api/auth', authRoutes_js_1.default);
    app.use('/api/psychiatrist', psychiatrist_routes_js_1.default);
    app.use('/api/admin', admin_routes_js_1.default);
    app.use('/api/config', configRoutes_js_1.default);
    app.use('/api/users', userRoutes_js_1.default);
    app.use('/api/messages', messageRoutes_js_1.default);
    app.use('/api/bookings', bookingRoute_js_1.default);
    app.use('/api/appointments', appointmentRoutes_js_1.default);
    app.use('/api/doctor', doctor_routes_js_1.default);
    app.use('/api/chat', chatRoutes_js_1.default);
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
