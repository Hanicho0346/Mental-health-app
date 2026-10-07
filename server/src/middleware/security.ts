import compression from 'compression';
import type { RequestHandler } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';

export function helmetMiddleware(): RequestHandler {
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

export function compressionMiddleware(): RequestHandler {
  return compression();
}

export function mongoSanitizeMiddleware(): RequestHandler {
  return mongoSanitize({ replaceWith: '_' });
}
