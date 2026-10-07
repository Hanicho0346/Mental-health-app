import { describe, expect, it } from 'vitest';
import { verificationEmailContent } from '../../src/integrations/email/templates/verification.js';
import { passwordResetEmailContent } from '../../src/integrations/email/templates/password-reset.js';

describe('email templates', () => {
  it('builds verification template', () => {
    const t = verificationEmailContent('111222', 'a@b.com');
    expect(t.subject).toMatch(/verify/i);
    expect(t.html).toContain('111222');
  });

  it('builds password reset template', () => {
    const t = passwordResetEmailContent('999888');
    expect(t.text).toContain('999888');
  });
});
