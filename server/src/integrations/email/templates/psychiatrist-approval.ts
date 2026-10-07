export function psychiatristApprovalContent(params: {
  fullName: string;
  approved: boolean;
  feedback?: string;
}) {
  const subject = params.approved
    ? 'Your psychiatrist application was approved'
    : 'Update on your psychiatrist application';
  const text = params.approved
    ? `Hello ${params.fullName}, your psychiatrist application has been approved. You can now access the psychiatrist portal.`
    : `Hello ${params.fullName}, your psychiatrist application needs attention.${params.feedback ? ` Feedback: ${params.feedback}` : ''}`;
  const html = params.approved
    ? `<p>Hello <strong>${params.fullName}</strong>,</p><p>Your psychiatrist application has been <strong>approved</strong>. You can now access the psychiatrist portal.</p>`
    : `<p>Hello <strong>${params.fullName}</strong>,</p><p>Your psychiatrist application was <strong>not approved</strong> at this time.</p>${params.feedback ? `<p><strong>Feedback:</strong> ${params.feedback}</p>` : ''}`;
  return { subject, text, html };
}
