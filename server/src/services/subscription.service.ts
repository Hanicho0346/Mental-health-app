import crypto from 'crypto';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import {
  initiateChapaPayment,
  verifyChapaPayment,
} from '../services/chapa.service.js';

const PREMIER_PRICE = 299;

export async function initiatePremierSubscription(params: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  callbackUrl: string;
  returnUrl: string;
}) {
  // If a pending subscription already exists for this user, reuse it
  const existing = await Subscription.findOne({
    user_id: params.userId,
    payment_status: 'pending',
    tier: 'premier',
  }).lean();

  const tx_ref = existing?.tx_ref ?? `sub_${crypto.randomUUID()}`;

  if (!existing) {
    await Subscription.create({
      user_id: params.userId,
      tx_ref,
      tier: 'premier',
      amount: PREMIER_PRICE,
      payment_status: 'pending',
    });
  }

  const payment = await initiateChapaPayment({
    tx_ref,
    amount: PREMIER_PRICE,
    email: params.email,
    first_name: params.firstName,
    last_name: params.lastName,
    callback_url: params.callbackUrl,
    return_url: `${params.returnUrl}?tx_ref=${tx_ref}`,
    description: 'Tesfa Premier Subscription',
  });

  return {
    tx_ref,
    checkout_url: payment.checkout_url,
  };
}

export async function verifyPremierSubscription(
  tx_ref: string,
  requestingUserId?: string
) {
  const existing = await Subscription.findOne({ tx_ref }).lean();

  if (!existing) {
    throw new AppError(404, 'Subscription not found');
  }

  if (requestingUserId && existing.user_id.toString() !== requestingUserId) {
    throw new AppError(403, 'Forbidden');
  }

  if (existing.payment_status === 'paid') {
    const user = await User.findById(existing.user_id).select(
      'subscription_tier is_premier premier_expires_at'
    ).lean();

    if (!user?.is_premier || user.subscription_tier !== 'premier') {
      const expiresAt = user?.premier_expires_at ?? new Date();
      if (!user?.premier_expires_at) {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      await User.findByIdAndUpdate(existing.user_id, {
        subscription_tier: 'premier',
        is_premier: true,
        premier_expires_at: expiresAt,
        ai_chats_daily_limit: null,
      });

      return {
        success: true,
        already_paid: true,
        expires_at: expiresAt,
      };
    }

    return {
      success: true,
      already_paid: true,
      expires_at: user?.premier_expires_at,
    };
  }

  const verification = await verifyChapaPayment(tx_ref);

  if (!verification.success) {
    throw new AppError(400, 'Payment not successful');
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  await Subscription.updateOne({ tx_ref }, { payment_status: 'paid' });

  await User.findByIdAndUpdate(existing.user_id, {
    subscription_tier: 'premier',
    is_premier: true,
    premier_expires_at: expiresAt,
    ai_chats_daily_limit: null,
  });

  return {
    success: true,
    expires_at: expiresAt,
  };
}
