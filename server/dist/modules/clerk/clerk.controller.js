"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clerkSync = void 0;
const clerk_service_js_1 = require("./clerk.service.js");
const auth_service_js_1 = require("../auth/auth.service.js");
const clerkSync = async (req, res, next) => {
    try {
        if (!req.clerkSession) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const result = await (0, clerk_service_js_1.syncClerkAccount)(req.clerkSession, req.body, req);
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_service_js_1.logAuthError)('clerk.sync', err);
        next(err);
    }
};
exports.clerkSync = clerkSync;
