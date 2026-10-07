export function appointmentConfirmationContent(params: {
  fullName: string;
  counselorName: string;
  scheduledAt: string;
  timeLabel: string;
}) {
  const subject = 'Appointment confirmed';
  const text = `Hi ${params.fullName}, your appointment with ${params.counselorName} is scheduled for ${params.scheduledAt} (${params.timeLabel}).`;
  const html = `<p>Hi <strong>${params.fullName}</strong>,</p>
    <p>Your appointment with <strong>${params.counselorName}</strong> is confirmed.</p>
    <p><strong>When:</strong> ${params.scheduledAt}<br/><strong>Time:</strong> ${params.timeLabel}</p>`;
  return { subject, text, html };
}

export function appointmentReminderContent(params: {
  fullName: string;
  counselorName: string;
  scheduledAt: string;
  timeLabel: string;
}) {
  const subject = 'Appointment reminder';
  const text = `Reminder: your session with ${params.counselorName} is coming up at ${params.scheduledAt} (${params.timeLabel}).`;
  const html = `<p>Hi <strong>${params.fullName}</strong>,</p>
    <p>This is a reminder for your upcoming session with <strong>${params.counselorName}</strong>.</p>
    <p><strong>When:</strong> ${params.scheduledAt}<br/><strong>Time:</strong> ${params.timeLabel}</p>`;
  return { subject, text, html };
}
