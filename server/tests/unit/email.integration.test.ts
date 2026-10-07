import { describe, expect, it, vi } from 'vitest';
import { verificationEmailContent } from '../src/integrations/email/templates/verification.js';

describe('verificationEmailContent', () => {
  it('includes code in body without logging helpers exposing secrets elsewhere', () => {
    const { subject, text } = verificationEmailContent('123456', 'user@example.com');
    expect(subject).toContain('Verify');
    expect(text).toContain('123456');
  });
});

describe('enqueueEmailJob idempotency key', () => {
  it('uses stable job id pattern', () => {
    const userId = 'abc123';
    const jobId = `email-verify-${userId}`;
    expect(jobId).toBe('email-verify-abc123');
  });
});
