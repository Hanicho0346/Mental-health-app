import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { verifyChapaWebhookSignature } from '../src/utils/chapaWebhook.js';

describe('verifyChapaWebhookSignature', () => {
  const secret = 'test-webhook-secret';

  it('allows requests when secret is not configured', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { headers: {}, body: { trx_ref: 'TX-1' } } as never;
    expect(verifyChapaWebhookSignature(req, res as never, '')).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects missing signature when secret is configured', () => {
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }), json: vi.fn() };
    const body = { trx_ref: 'TX-1' };
    const req = { headers: {}, body } as never;
    expect(verifyChapaWebhookSignature(req, res as never, secret)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects invalid signature', () => {
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }), json: vi.fn() };
    const body = { trx_ref: 'TX-1' };
    const req = { headers: { 'x-chapa-signature': 'bad' }, body } as never;
    expect(verifyChapaWebhookSignature(req, res as never, secret)).toBe(false);
  });

  it('accepts valid signature', () => {
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }), json: vi.fn() };
    const body = { trx_ref: 'TX-1' };
    const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const req = { headers: { 'x-chapa-signature': sig }, body } as never;
    expect(verifyChapaWebhookSignature(req, res as never, secret)).toBe(true);
  });
});
