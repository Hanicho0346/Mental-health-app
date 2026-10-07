export function passwordResetEmailContent(code: string) {
  const subject = 'Password reset';
  const text = `Your password reset code is: ${code}. It expires in one hour.`;
  const html = `
    <p>Hello,</p>
    <p>Use this code to reset your password:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
    <p>This code expires in one hour.</p>
    <p>If you did not request a reset, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}
