const supabase = require('../../lib/supabaseClient');
const { sendEmail } = require('../../lib/emailClient');

const NOTIFICATION_TYPES = {
  APPOINTMENT_REMINDER_30M: 'appointment_reminder_30m',
  STAFF_REQUEST_APPROVED: 'staff_request_approved',
  STAFF_REQUEST_REJECTED: 'staff_request_rejected'
};

const NOTIFICATION_SELECT_FIELDS = `
  id,
  notification_type,
  user_id,
  appointment_id,
  staff_request_id,
  slot_occurrence_key,
  recipient_email,
  subject,
  status,
  provider_message_id,
  error_message,
  attempt_count,
  scheduled_for,
  sent_at,
  metadata,
  created_at,
  updated_at
`;

/**
 * Creates a service error with a status code so controllers can return
 * consistent API responses.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Converts a value into a trimmed email string.
 */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Basic email validation.
 * The database also has a recipient_email check constraint, but this gives
 * cleaner errors before trying to insert.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildSlotOccurrenceKey(appointment) {
  const appointmentId = String(appointment?.id || '').trim();
  const slotDate = String(appointment?.slot?.date || '').trim();
  const slotStartTime = String(appointment?.slot?.start_time || '').trim();

  if (!appointmentId || !slotDate || !slotStartTime) {
    return null;
  }

  return `${appointmentId}:${slotDate}:${slotStartTime}`;
}

/**
 * Fetches the recipient email from Supabase Auth.
 * We use Auth admin lookup instead of redesigning profiles just to store emails.
 */
async function fetchUserEmail(userId) {
  if (!userId) {
    throw createServiceError('user_id is required to fetch recipient email.', 400);
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    throw createServiceError('Failed to fetch recipient email.', 500);
  }

  const email = normalizeEmail(data.user.email);

  if (!email || !isValidEmail(email)) {
    throw createServiceError('Recipient email is missing or invalid.', 400);
  }

  return email;
}

/**
 * Finds an existing notification for duplicate handling.
 * This is mainly used after the database unique index blocks a duplicate insert.
 */
async function findExistingNotification({
  notificationType,
  appointmentId,
  staffRequestId,
  slotOccurrenceKey
}) {
  let query = supabase
    .from('email_notifications')
    .select(NOTIFICATION_SELECT_FIELDS)
    .eq('notification_type', notificationType);

  if (slotOccurrenceKey) {
    query = query.eq('slot_occurrence_key', slotOccurrenceKey);
  }

  if (appointmentId) {
    query = query.eq('appointment_id', appointmentId);
  }

  if (staffRequestId) {
    query = query.eq('staff_request_id', staffRequestId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw createServiceError('Failed to check existing notification.', 500);
  }

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/**
 * Creates a notification row in email_notifications.
 * The database unique indexes prevent duplicate appointment/staff notifications.
 */
async function createNotification({
  notificationType,
  userId,
  appointmentId = null,
  staffRequestId = null,
  slotOccurrenceKey = null,
  recipientEmail,
  subject,
  scheduledFor = null,
  metadata = {}
}) {
  if (!notificationType || !userId || !recipientEmail) {
    throw createServiceError(
      'notification_type, user_id, and recipient_email are required.',
      400
    );
  }

  if (!appointmentId && !staffRequestId) {
    throw createServiceError(
      'appointment_id or staff_request_id is required for a notification.',
      400
    );
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);

  if (!isValidEmail(normalizedRecipientEmail)) {
    throw createServiceError('recipient_email is invalid.', 400);
  }

  const { data, error } = await supabase
    .from('email_notifications')
    .insert([
      {
        notification_type: notificationType,
        user_id: userId,
        appointment_id: appointmentId,
        staff_request_id: staffRequestId,
        slot_occurrence_key: slotOccurrenceKey,
        recipient_email: normalizedRecipientEmail,
        subject,
        status: 'pending',
        scheduled_for: scheduledFor,
        metadata
      }
    ])
    .select(NOTIFICATION_SELECT_FIELDS)
    .single();

  // PostgreSQL unique violation. This means the reminder already exists.
  if (error?.code === '23505') {
    const existingNotification = await findExistingNotification({
      notificationType,
      appointmentId,
      staffRequestId,
      slotOccurrenceKey
    });

    return {
      created: false,
      duplicate: true,
      notification: existingNotification
    };
  }

  if (error || !data) {
    throw createServiceError('Failed to create email notification.', 500);
  }

  return {
    created: true,
    duplicate: false,
    notification: data
  };
}

/**
 * Marks a notification as sent after the provider accepts the email.
 */
async function markNotificationSent({ notificationId, providerMessageId, attemptCount }) {
  const sentAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('email_notifications')
    .update({
      status: 'sent',
      provider_message_id: providerMessageId,
      error_message: null,
      attempt_count: Number(attemptCount || 0) + 1,
      sent_at: sentAt,
      updated_at: sentAt
    })
    .eq('id', notificationId)
    .select(NOTIFICATION_SELECT_FIELDS)
    .single();

  if (error || !data) {
    throw createServiceError('Failed to mark notification as sent.', 500);
  }

  return data;
}

/**
 * Marks a notification as failed if the provider rejects the email.
 */
async function markNotificationFailed({ notificationId, errorMessage, attemptCount }) {
  const failedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('email_notifications')
    .update({
      status: 'failed',
      error_message: String(errorMessage || 'Email sending failed.'),
      attempt_count: Number(attemptCount || 0) + 1,
      updated_at: failedAt
    })
    .eq('id', notificationId)
    .select(NOTIFICATION_SELECT_FIELDS)
    .single();

  if (error || !data) {
    throw createServiceError('Failed to mark notification as failed.', 500);
  }

  return data;
}

/**
 * Builds the appointment reminder email content.
 */
function buildAppointmentReminderEmail(appointment) {
  const clinicName = appointment.clinic?.name || 'your clinic';
  const slot = appointment.slot || {};
  const appointmentDate = slot.date || 'your appointment date';
  const appointmentTime = slot.start_time || 'your appointment time';
  const host = process.env.HOST || process.env.APP_BASE_URL || '';

  const subject = 'VitaQ appointment reminder';

  const text = [
    `Reminder: your appointment at ${clinicName} is starting soon.`,
    `Date: ${appointmentDate}`,
    `Time: ${appointmentTime}`,
    host ? `View your appointment: ${host}/appointments` : null,
    '',
    'Please arrive on time and check your queue status in VitaQ.'
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>VitaQ appointment reminder</h2>
      <p>Your appointment at <strong>${clinicName}</strong> is starting soon.</p>
      <p><strong>Date:</strong> ${appointmentDate}</p>
      <p><strong>Time:</strong> ${appointmentTime}</p>
      <p>Please arrive on time and check your queue status in VitaQ.</p>
      ${
        host
          ? `<p><a href="${host}/appointments">View your appointment</a></p>`
          : ''
      }
    </div>
  `;

  return {
    subject,
    text,
    html
  };
}

/**
 * Creates, sends, and updates one appointment reminder notification.
 * Duplicate reminders are skipped safely.
 */
async function sendAppointmentReminder(appointment) {
  if (!appointment?.id || !appointment?.patient_id) {
    throw createServiceError('appointment id and patient_id are required.', 400);
  }

  const recipientEmail = await fetchUserEmail(appointment.patient_id);
  const emailContent = buildAppointmentReminderEmail(appointment);
  const slotOccurrenceKey = buildSlotOccurrenceKey(appointment);

  const notificationResult = await createNotification({
    notificationType: NOTIFICATION_TYPES.APPOINTMENT_REMINDER_30M,
    userId: appointment.patient_id,
    appointmentId: appointment.id,
    slotOccurrenceKey,
    recipientEmail,
    subject: emailContent.subject,
    scheduledFor: appointment.appointment_start_at || null,
    metadata: {
      clinic_id: appointment.clinic_id,
      slot_id: appointment.slot_id,
      slot_date: appointment.slot?.date || null,
      slot_start_time: appointment.slot?.start_time || null
    }
  });

  if (notificationResult.duplicate) {
    return {
      sent: false,
      skipped: true,
      reason: 'duplicate',
      notification: notificationResult.notification
    };
  }

  const notification = notificationResult.notification;

  try {
    const providerResult = await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      idempotencyKey: `${NOTIFICATION_TYPES.APPOINTMENT_REMINDER_30M}:${appointment.id}`
    });

    const sentNotification = await markNotificationSent({
      notificationId: notification.id,
      providerMessageId: providerResult.messageId,
      attemptCount: notification.attempt_count
    });

    return {
      sent: true,
      skipped: false,
      notification: sentNotification,
      provider: providerResult
    };
  } catch (error) {
    const failedNotification = await markNotificationFailed({
      notificationId: notification.id,
      errorMessage: error.message,
      attemptCount: notification.attempt_count
    });

    return {
      sent: false,
      skipped: false,
      failed: true,
      notification: failedNotification,
      error: error.message
    };
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  createServiceError,
  buildSlotOccurrenceKey,
  fetchUserEmail,
  createNotification,
  markNotificationSent,
  markNotificationFailed,
  buildAppointmentReminderEmail,
  sendAppointmentReminder
};
