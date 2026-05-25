"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClerkConfigured = isClerkConfigured;
exports.getClerkClient = getClerkClient;
exports.verifyClerkSessionToken = verifyClerkSessionToken;
const backend_1 = require("@clerk/backend");
const env_js_1 = require("../config/env.js");
const AppError_js_1 = require("./AppError.js");
let clerkClient = null;
function isClerkConfigured() {
    return Boolean(env_js_1.env.clerkSecretKey && env_js_1.env.clerkSecretKey.length > 0);
}
function getClerkClient() {
    if (!isClerkConfigured()) {
        throw new AppError_js_1.AppError(503, 'Clerk authentication is not configured on the server');
    }
    if (!clerkClient) {
        clerkClient = (0, backend_1.createClerkClient)({ secretKey: env_js_1.env.clerkSecretKey });
    }
    return clerkClient;
}
async function verifyClerkSessionToken(token) {
    if (!isClerkConfigured()) {
        throw new AppError_js_1.AppError(503, 'Clerk authentication is not configured on the server');
    }
    try {
        const payload = await (0, backend_1.verifyToken)(token, {
            secretKey: env_js_1.env.clerkSecretKey,
            clockSkewInMs: 15_000,
        });
        const clerkId = payload.sub;
        if (!clerkId) {
            throw new AppError_js_1.AppError(401, 'Invalid Clerk token');
        }
        const client = getClerkClient();
        const user = await client.users.getUser(clerkId);
        const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
            user.emailAddresses[0]?.emailAddress;
        if (!email) {
            throw new AppError_js_1.AppError(400, 'Clerk account has no email address');
        }
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0];
        return {
            clerkId,
            email: email.toLowerCase(),
            fullName,
            profileImage: user.imageUrl ?? '',
        };
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError)
            throw err;
        // TEMPORARY — remove after debugging
        console.error('[clerk.verify] raw error:', err);
        throw new AppError_js_1.AppError(401, 'Invalid or expired Clerk session');
    }
}
