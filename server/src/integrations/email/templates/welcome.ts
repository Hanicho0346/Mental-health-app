export function welcomeEmailContent(fullName: string) {
  const subject = 'Welcome to Tesfa Mind';
  const text = `Hello ${fullName}, welcome to Tesfa Mind. We're glad you're here.`;
  const html = `<p>Hello <strong>${fullName}</strong>,</p><p>Welcome to Tesfa Mind. We're glad you're here.</p>`;
  return { subject, text, html };
}
