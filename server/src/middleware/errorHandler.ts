import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { exposeErrorDetailsToClient, logServerError, logServerWarn } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logServerError('AppError', err, { method: req.method, path: req.originalUrl, status: err.status });
    } else {
      logServerWarn('AppError', { method: req.method, path: req.originalUrl, status: err.status, message: err.message });
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', issues: err.flatten() });
    return;
  }
  logServerError('Unhandled route error', err, {
    method: req.method,
    path: req.originalUrl,
  });
  const status = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : 500;
  const body: Record<string, unknown> = {
    error: status === 500 ? 'Internal server error' : (err as Error).message || 'Request failed',
  };
  if (exposeErrorDetailsToClient() && err instanceof Error) {
    body.detail = err.message;
    if (err.stack) body.stack = err.stack;
  }
  res.status(status >= 400 && status < 600 ? status : 500).json(body);
};
