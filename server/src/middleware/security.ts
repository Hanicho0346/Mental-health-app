import compression from 'compression';
import type { RequestHandler } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';

export function helmetMiddleware(): RequestHandler {
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

export function compressionMiddleware(): RequestHandler {
  return compression();
}

export function mongoSanitizeMiddleware(): RequestHandler {
  return mongoSanitize({ replaceWith: '_' });
}
