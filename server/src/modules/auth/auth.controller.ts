import type { RequestHandler } from 'express';
import { AppError } from '../../utils/AppError.js';
import * as authService from './auth.service.js';

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

function handleAuthError(res: Parameters<RequestHandler>[1], err: unknown, context: string, extra?: Record<string, unknown>): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  authService.logAuthError(context, err, extra);
  res.status(500).json({ error: `${context} failed` });
}

export const register: RequestHandler = async (req, res) => {
  const body = req.body as {
    full_name: string;
    email: string;
    password: string;
    role?: string;
    national_id?: string;
    medical_license?: string;
    specialization?: string;
    experience_years?: number;
  };
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
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
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
      } catch (resumeErr) {
        if (resumeErr instanceof AppError) {
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
      email: typeof (req.body as { email?: unknown })?.email === 'string' ? (req.body as { email: string }).email : undefined,
    });
  }
};

export const login: RequestHandler = async (req, res) => {
  try {
    const body = req.body as { email: string; password: string };
    const out = await authService.loginWithPassword(body, req);
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Login', {
      email: typeof (req.body as { email?: unknown })?.email === 'string' ? (req.body as { email: string }).email : undefined,
    });
  }
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const out = await authService.refreshTokens(refreshToken, req);
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Token refresh');
  }
};

export const logout: RequestHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await authService.logoutRefresh(refreshToken);
    }
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(res, err, 'Logout');
  }
};

export const verifyEmail: RequestHandler = async (req, res) => {
  try {
    const out = await authService.verifyEmailCode(req.body as { email: string; code: string });
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Email verification');
  }
};

export const resendVerification: RequestHandler = async (req, res) => {
  try {
    const out = await authService.resendVerificationEmail(req.body as { email: string });
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Resend verification');
  }
};

export const forgotPassword: RequestHandler = async (req, res) => {
  try {
    const out = await authService.forgotPasswordRequest(req.body as { email: string });
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Forgot password');
  }
};

export const resetPassword: RequestHandler = async (req, res) => {
  try {
    const out = await authService.resetPasswordWithCode(req.body as { email: string; code: string; password: string });
    res.json(out);
  } catch (err) {
    handleAuthError(res, err, 'Reset password');
  }
};
