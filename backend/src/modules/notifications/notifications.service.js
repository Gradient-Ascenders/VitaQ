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

function canRetryNotification(notification) {
  return notification?.status === 'failed';
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
  staffRequestId
}) {
  let query = supabase
    .from('email_notifications')
    .select(NOTIFICATION_SELECT_FIELDS)
    .eq('notification_type', notificationType);

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

  const notificationPayload = {
    notification_type: notificationType,
    user_id: userId,
    appointment_id: appointmentId,
    staff_request_id: staffRequestId,
    recipient_email: normalizedRecipientEmail,
    subject,
    status: 'pending',
    scheduled_for: scheduledFor,
    metadata
  };

  const { data, error } = await supabase
    .from('email_notifications')
    .insert([notificationPayload])
    .select(NOTIFICATION_SELECT_FIELDS)
    .single();

  // PostgreSQL unique violation. This means the reminder already exists.
  if (error?.code === '23505') {
    const existingNotification = await findExistingNotification({
      notificationType,
      appointmentId,
      staffRequestId
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

function buildStaffDecisionEmail(staffRequest) {
  const status = staffRequest?.status;

  if (!['approved', 'rejected'].includes(status)) {
    throw createServiceError('Staff request status must be approved or rejected.', 400);
  }

  const isApproved = status === 'approved';
  const clinicName = staffRequest.clinic?.name || 'your clinic';
  const requesterName = staffRequest.full_name || 'there';
  const host = process.env.APP_BASE_URL || process.env.HOST || '';
  const subject = isApproved
    ? 'VitaQ staff application approved'
    : 'VitaQ staff application rejected';

  const decisionLine = isApproved
    ? `Your staff application for ${clinicName} has been approved.`
    : `Your staff application for ${clinicName} has been rejected.`;

  const nextStep = isApproved
    ? 'You can now sign in to VitaQ and access the staff dashboard for your clinic.'
    : 'If you believe this decision is incorrect, please contact the clinic administrator.';

  const text = [
    `Hi ${requesterName},`,
    '',
    decisionLine,
    nextStep,
    host && isApproved ? `Open VitaQ: ${host}` : null,
    '',
    'VitaQ'
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>${subject}</h2>
      <p>Hi ${requesterName},</p>
      <p>${decisionLine}</p>
      <p>${nextStep}</p>
      ${
        host && isApproved
          ? `<p><a href="${host}">Open VitaQ</a></p>`
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

async function deliverNotificationEmail({
  notification,
  recipientEmail,
  emailContent,
  idempotencyKey,
  created = true
}) {
  try {
    const providerResult = await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      idempotencyKey
    });

    const sentNotification = await markNotificationSent({
      notificationId: notification.id,
      providerMessageId: providerResult.messageId,
      attemptCount: notification.attempt_count
    });

    return {
      sent: true,
      skipped: false,
      created,
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
      created,
      failed: true,
      notification: failedNotification,
      error: error.message
    };
  }
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

  const notificationResult = await createNotification({
    notificationType: NOTIFICATION_TYPES.APPOINTMENT_REMINDER_30M,
    userId: appointment.patient_id,
    appointmentId: appointment.id,
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
    if (canRetryNotification(notificationResult.notification)) {
      return deliverNotificationEmail({
        notification: notificationResult.notification,
        recipientEmail,
        emailContent,
        idempotencyKey: `${NOTIFICATION_TYPES.APPOINTMENT_REMINDER_30M}:${appointment.id}`,
        created: false
      });
    }

    return {
      sent: false,
      skipped: true,
      reason: 'duplicate',
      notification: notificationResult.notification
    };
  }

  const notification = notificationResult.notification;

  return deliverNotificationEmail({
    notification,
    recipientEmail,
    emailContent,
    idempotencyKey: `${NOTIFICATION_TYPES.APPOINTMENT_REMINDER_30M}:${appointment.id}`
  });
}

async function sendStaffDecisionNotification(staffRequest) {
  if (!staffRequest?.id || !staffRequest?.user_id || !staffRequest?.status) {
    throw createServiceError('staff request id, user_id, and status are required.', 400);
  }

  const notificationType =
    staffRequest.status === 'approved'
      ? NOTIFICATION_TYPES.STAFF_REQUEST_APPROVED
      : staffRequest.status === 'rejected'
        ? NOTIFICATION_TYPES.STAFF_REQUEST_REJECTED
        : null;

  if (!notificationType) {
    throw createServiceError('Staff request status must be approved or rejected.', 400);
  }

  const recipientEmail = await fetchUserEmail(staffRequest.user_id);
  const emailContent = buildStaffDecisionEmail(staffRequest);

  const notificationResult = await createNotification({
    notificationType,
    userId: staffRequest.user_id,
    staffRequestId: staffRequest.id,
    recipientEmail,
    subject: emailContent.subject,
    metadata: {
      clinic_id: staffRequest.clinic_id || null,
      staff_id: staffRequest.staff_id || null,
      reviewed_at: staffRequest.reviewed_at || null,
      status: staffRequest.status
    }
  });

  if (notificationResult.duplicate) {
    if (canRetryNotification(notificationResult.notification)) {
      return deliverNotificationEmail({
        notification: notificationResult.notification,
        recipientEmail,
        emailContent,
        idempotencyKey: `${notificationType}:${staffRequest.id}`,
        created: false
      });
    }

    return {
      sent: false,
      skipped: true,
      reason: 'duplicate',
      notification: notificationResult.notification
    };
  }

  return deliverNotificationEmail({
    notification: notificationResult.notification,
    recipientEmail,
    emailContent,
    idempotencyKey: `${notificationType}:${staffRequest.id}`
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  createServiceError,
  fetchUserEmail,
  createNotification,
  markNotificationSent,
  markNotificationFailed,
  buildAppointmentReminderEmail,
  buildStaffDecisionEmail,
  sendAppointmentReminder,
  sendStaffDecisionNotification
};
