import type { RequestHandler } from 'express';
import { pingDb } from '../database/connection.js';
import { pingRedis } from '../integrations/redis/redis.client.js';

export const healthHandler: RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

export const readyHandler: RequestHandler = async (_req, res) => {
  const [mongoOk, redisOk] = await Promise.all([pingDb(), pingRedis()]);

  if (!mongoOk || !redisOk) {
    res.status(503).json({
      ok: false,
      checks: {
        mongodb: mongoOk,
        redis: redisOk,
      },
    });
    return;
  }

  res.json({
    ok: true,
    checks: {
      mongodb: true,
      redis: true,
    },
  });
};
