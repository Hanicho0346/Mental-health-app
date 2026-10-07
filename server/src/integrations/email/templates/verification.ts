export function verificationEmailContent(code: string, email: string) {
  const subject = 'Verify your email';
  const text = `Your verification code is: ${code}. It expires in 15 minutes.`;
  const html = `
    <p>Hello,</p>
    <p>Use this code to verify <strong>${escapeHtml(email)}</strong>:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
