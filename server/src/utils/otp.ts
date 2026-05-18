import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export function generateNumericOtp(length = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(randomInt(min, max + 1));
}

export function hashOtp(pepper: string, code: string): string {
  return createHmac('sha256', pepper).update(code.trim(), 'utf8').digest('hex');
}

export function verifyOtpHash(pepper: string, code: string, storedHash: string): boolean {
  const computed = hashOtp(pepper, code);
  try {
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
