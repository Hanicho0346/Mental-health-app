"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.resendVerification = exports.verifyEmail = exports.logout = exports.refresh = exports.login = exports.register = void 0;
const AppError_js_1 = require("../../utils/AppError.js");
const authService = __importStar(require("./auth.service.js"));
function isDuplicateKeyError(err) {
    return typeof err === 'object' && err !== null && err.code === 11000;
}
function handleAuthError(res, err, context, extra) {
    if (err instanceof AppError_js_1.AppError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    authService.logAuthError(context, err, extra);
    res.status(500).json({ error: `${context} failed` });
}
const register = async (req, res) => {
    const body = req.body;
    try {
        const out = await authService.registerWithPassword(body, req);
        if ('needsVerification' in out && out.needsVerification) {
            res.status(201).json({
                needsVerification: true,
                email: out.email,
                ...(out.verificationResent ? { verificationResent: true } : {}),
            });
            return;
        }
        res.status(201).json(out);
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError && err.status === 409) {
            res.status(409).json({ error: err.message, code: 'EMAIL_EXISTS' });
            return;
        }
        if (isDuplicateKeyError(err)) {
            try {
                const resumed = await authService.resumeRegistrationIfUnverified({
                    full_name: body.full_name,
                    email: body.email,
                    password: body.password,
                });
                if (resumed) {
                    res.status(201).json({
                        needsVerification: true,
                        email: resumed.email,
                        verificationResent: true,
                    });
                    return;
                }
            }
            catch (resumeErr) {
                if (resumeErr instanceof AppError_js_1.AppError) {
                    res.status(resumeErr.status).json({ error: resumeErr.message });
                    return;
                }
            }
            res.status(409).json({
                error: 'This email is already registered. Please log in instead.',
                code: 'EMAIL_EXISTS',
            });
            return;
        }
        handleAuthError(res, err, 'Registration', {
            email: typeof req.body?.email === 'string' ? req.body.email : undefined,
        });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const body = req.body;
        const out = await authService.loginWithPassword(body, req);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Login', {
            email: typeof req.body?.email === 'string' ? req.body.email : undefined,
        });
    }
};
exports.login = login;
const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const out = await authService.refreshTokens(refreshToken, req);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Token refresh');
    }
};
exports.refresh = refresh;
const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (typeof refreshToken === 'string' && refreshToken.length > 0) {
            await authService.logoutRefresh(refreshToken);
        }
        res.json({ ok: true });
    }
    catch (err) {
        handleAuthError(res, err, 'Logout');
    }
};
exports.logout = logout;
const verifyEmail = async (req, res) => {
    try {
        const out = await authService.verifyEmailCode(req.body);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Email verification');
    }
};
exports.verifyEmail = verifyEmail;
const resendVerification = async (req, res) => {
    try {
        const out = await authService.resendVerificationEmail(req.body);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Resend verification');
    }
};
exports.resendVerification = resendVerification;
const forgotPassword = async (req, res) => {
    try {
        const out = await authService.forgotPasswordRequest(req.body);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Forgot password');
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    try {
        const out = await authService.resetPasswordWithCode(req.body);
        res.json(out);
    }
    catch (err) {
        handleAuthError(res, err, 'Reset password');
    }
};
exports.resetPassword = resetPassword;
