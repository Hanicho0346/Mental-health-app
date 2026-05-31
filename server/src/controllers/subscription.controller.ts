import crypto from 'crypto';
import type { RequestHandler } from 'express';
import {
  initiatePremierSubscription,
  verifyPremierSubscription,
} from '../services/subscription.service.js';
import { User } from '../models/User.js';

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const RETURN_URL = process.env.CHAPA_RETURN_URL ?? `${BASE_URL}/payment-return`;
const WEBHOOK_SECRET = process.env.CHAPA_WEBHOOK_SECRET ?? '';

export const initiatePremierHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

   const user = await User.findById(req.userId).select('email full_name').lean();
    if (!user?.email) {
      res.status(400).json({ error: 'User email not found' });
      return;
    }

    const [firstName = 'User', lastName = ''] = user.full_name?.split(' ') ?? ['User', ''];

    const result = await initiatePremierSubscription({
      userId: req.userId,
      email: user.email,
      firstName,
      lastName,
      callbackUrl: `${BASE_URL}/api/subscriptions/chapa/callback`,
      returnUrl: RETURN_URL,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const verifyPremierHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { tx_ref } = req.params;

    // Pass userId so users can't activate each other's subscriptions
    const result = await verifyPremierSubscription(tx_ref, req.userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const chapaSubscriptionCallbackHandler: RequestHandler = async (req, res, next) => {
  try {
    // 1. Verify Chapa's webhook signature
    const sig = req.headers['x-chapa-signature'] as string | undefined;

    if (WEBHOOK_SECRET) {
      const expected = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (!sig || sig !== expected) {
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
    }

    // 2. Chapa sends trx_ref (note the spelling)
    const tx_ref =
      (req.query['trx_ref'] as string) ??
      req.body?.trx_ref ??
      req.body?.tx_ref;

    if (!tx_ref) {
      res.status(400).json({ error: 'trx_ref missing' });
      return;
    }

    // No userId check here — webhook comes from Chapa, not from a user
    await verifyPremierSubscription(tx_ref);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};