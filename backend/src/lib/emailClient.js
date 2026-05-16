/**
 * Email provider wrapper for VitaQ.
 *
 * This file keeps provider-specific Resend logic out of the notification service.
 * If EMAIL_ENABLED is not true, it returns a fake success response so local tests
 * and development do not send real emails.
 */
async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!to || !subject || (!html && !text)) {
    throw new Error('to, subject, and html or text are required to send an email.');
  }

  // Local/test safety: do not send real emails unless explicitly enabled.
  if (!emailEnabled) {
    return {
      provider: 'disabled',
      messageId: `local-disabled-${Date.now()}`,
      to,
      subject
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.EMAIL_REPLY_TO;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_ENABLED=true.');
  }

  if (!fromEmail) {
    throw new Error('EMAIL_FROM_ADDRESS is required when EMAIL_ENABLED=true.');
  }

  // Require Resend only when emails are enabled so tests do not need the provider.
  const { Resend } = require('resend');
  const resend = new Resend(apiKey);

  const emailPayload = {
    from: fromEmail,
    to,
    subject,
    html,
    text,
    replyTo: replyTo || undefined,
    headers: idempotencyKey
      ? {
          'Idempotency-Key': idempotencyKey
        }
      : undefined
  };

  const response = await resend.emails.send(emailPayload);

  if (response.error) {
    throw new Error(response.error.message || 'Resend failed to send the email.');
  }

  return {
    provider: 'resend',
    messageId: response.data?.id || null,
    raw: response.data
  };
}

module.exports = {
  sendEmail
};
