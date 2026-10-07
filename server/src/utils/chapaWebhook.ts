import crypto from 'node:crypto';
import type { Request } from 'express';

/**
 * Verifies Chapa webhook HMAC when CHAPA_WEBHOOK_SECRET is configured.
 * Returns true when the request may proceed; sends 400 when signature is invalid.
 */
export function verifyChapaWebhookSignature(
  req: Request,
  res: { status: (code: number) => { json: (body: unknown) => void } },
  secret: string,
): boolean {
  if (!secret) {
    return true;
  }

  const sig = req.headers['x-chapa-signature'] as string | undefined;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body ?? {}))
    .digest('hex');

  if (!sig || sig !== expected) {
    res.status(400).json({ error: 'Invalid signature' });
    return false;
  }

  return true;
}
