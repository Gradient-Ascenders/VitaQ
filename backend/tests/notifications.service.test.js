// Mock Supabase and the email client before importing the notification service.
// These tests avoid real database calls and never send real emails.
jest.mock('../src/lib/supabaseClient', () => ({
  auth: {
    admin: {
      getUserById: jest.fn()
    }
  },
  from: jest.fn()
}));

jest.mock('../src/lib/emailClient', () => ({
  sendEmail: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const { sendEmail } = require('../src/lib/emailClient');

const {
  fetchUserEmail,
  createNotification,
  buildStaffDecisionEmail,
  sendAppointmentReminder,
  sendStaffDecisionNotification
} = require('../src/modules/notifications/notifications.service');

/**
 * Creates a mocked Supabase insert chain:
 * supabase.from(...).insert(...).select(...).single()
 */
function createInsertQuery(result) {
  const singleChain = {
    single: jest.fn(() => Promise.resolve(result))
  };

  const selectChain = {
    select: jest.fn(() => singleChain)
  };

  return {
    insert: jest.fn(() => selectChain),
    _selectChain: selectChain,
    _singleChain: singleChain
  };
}

/**
 * Creates a mocked Supabase update chain:
 * supabase.from(...).update(...).eq(...).select(...).single()
 */
function createUpdateQuery(result) {
  const singleChain = {
    single: jest.fn(() => Promise.resolve(result))
  };

  const query = {
    update: jest.fn(() => query),
    eq: jest.fn(() => query),
    select: jest.fn(() => singleChain),
    _singleChain: singleChain
  };

  return query;
}

/**
 * Creates a mocked Supabase lookup chain:
 * supabase.from(...).select(...).eq(...).limit(...)
 */
function createLookupQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    limit: jest.fn(() => Promise.resolve(result))
  };

  return query;
}

function reminderAppointment(overrides = {}) {
  return {
    id: 'appointment-1',
    patient_id: 'patient-1',
    clinic_id: 'clinic-1',
    slot_id: 'slot-1',
    appointment_start_at: '2026-05-10T08:20:00.000Z',
    clinic: {
      id: 'clinic-1',
      name: 'Rosebank Med Dental Centre'
    },
    slot: {
      id: 'slot-1',
      date: '2026-05-10',
      start_time: '10:20:00',
      end_time: '10:50:00'
    },
    ...overrides
  };
}

function staffRequest(overrides = {}) {
  return {
    id: 'staff-request-1',
    user_id: 'staff-user-1',
    full_name: 'Staff Member',
    clinic_id: 'clinic-1',
    staff_id: 'STAFF-001',
    status: 'approved',
    reviewed_at: '2026-05-10T08:00:00.000Z',
    clinic: {
      id: 'clinic-1',
      name: 'Rosebank Med Dental Centre'
    },
    ...overrides
  };
}

describe('notifications.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchUserEmail', () => {
    test('fetches and normalizes a user email from Supabase Auth admin API', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: '  PATIENT@example.com  '
          }
        },
        error: null
      });

      const result = await fetchUserEmail('patient-1');

      expect(result).toBe('patient@example.com');
      expect(supabase.auth.admin.getUserById).toHaveBeenCalledWith('patient-1');
    });

    test('throws a clean error when the user id is missing', async () => {
      await expect(fetchUserEmail()).rejects.toMatchObject({
        message: 'user_id is required to fetch recipient email.',
        statusCode: 400
      });

      expect(supabase.auth.admin.getUserById).not.toHaveBeenCalled();
    });

    test('throws a clean error when Supabase Auth lookup fails', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: null,
        error: { message: 'Auth lookup failed' }
      });

      await expect(fetchUserEmail('patient-1')).rejects.toMatchObject({
        message: 'Failed to fetch recipient email.',
        statusCode: 500
      });
    });

    test('throws a clean error when the email is missing or invalid', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: ''
          }
        },
        error: null
      });

      await expect(fetchUserEmail('patient-1')).rejects.toMatchObject({
        message: 'Recipient email is missing or invalid.',
        statusCode: 400
      });
    });
  });

  describe('createNotification', () => {
    test('creates a pending appointment reminder notification row', async () => {
      const createdNotification = {
        id: 'notification-1',
        notification_type: 'appointment_reminder_30m',
        user_id: 'patient-1',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        staff_request_id: null,
        recipient_email: 'patient@example.com',
        subject: 'VitaQ appointment reminder',
        status: 'pending',
        attempt_count: 0
      };

      const insertQuery = createInsertQuery({
        data: createdNotification,
        error: null
      });

      supabase.from.mockReturnValueOnce(insertQuery);

      const result = await createNotification({
        notificationType: 'appointment_reminder_30m',
        userId: 'patient-1',
        appointmentId: 'appointment-1',
        slotOccurrenceKey: 'appointment-1:2026-05-10:10:20:00',
        recipientEmail: 'PATIENT@example.com',
        subject: 'VitaQ appointment reminder',
        scheduledFor: '2026-05-10T08:20:00.000Z',
        metadata: {
          clinic_id: 'clinic-1'
        }
      });

      expect(result).toEqual({
        created: true,
        duplicate: false,
        notification: createdNotification
      });

      expect(supabase.from).toHaveBeenCalledWith('email_notifications');
      expect(insertQuery.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          notification_type: 'appointment_reminder_30m',
          user_id: 'patient-1',
          appointment_id: 'appointment-1',
          slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
          recipient_email: 'patient@example.com',
          subject: 'VitaQ appointment reminder',
          status: 'pending',
          scheduled_for: '2026-05-10T08:20:00.000Z',
          metadata: {
            clinic_id: 'clinic-1'
          }
        })
      ]);
    });

    test('rejects a notification without appointment or staff request target', async () => {
      await expect(
        createNotification({
          notificationType: 'appointment_reminder_30m',
          userId: 'patient-1',
          recipientEmail: 'patient@example.com',
          subject: 'VitaQ appointment reminder'
        })
      ).rejects.toMatchObject({
        message: 'appointment_id or staff_request_id is required for a notification.',
        statusCode: 400
      });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    test('rejects an invalid recipient email before inserting', async () => {
      await expect(
        createNotification({
          notificationType: 'appointment_reminder_30m',
          userId: 'patient-1',
          appointmentId: 'appointment-1',
          recipientEmail: 'not-an-email',
          subject: 'VitaQ appointment reminder'
        })
      ).rejects.toMatchObject({
        message: 'recipient_email is invalid.',
        statusCode: 400
      });

      expect(supabase.from).not.toHaveBeenCalled();
    });

    test('returns an existing notification when duplicate insert is blocked', async () => {
      const existingNotification = {
        id: 'notification-existing',
        notification_type: 'appointment_reminder_30m',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        status: 'sent'
      };

      const duplicateInsertQuery = createInsertQuery({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint'
        }
      });

      const existingLookupQuery = createLookupQuery({
        data: [existingNotification],
        error: null
      });

      supabase.from
        .mockReturnValueOnce(duplicateInsertQuery)
        .mockReturnValueOnce(existingLookupQuery);

      const result = await createNotification({
        notificationType: 'appointment_reminder_30m',
        userId: 'patient-1',
        appointmentId: 'appointment-1',
        slotOccurrenceKey: 'appointment-1:2026-05-10:10:20:00',
        recipientEmail: 'patient@example.com',
        subject: 'VitaQ appointment reminder'
      });

      expect(result).toEqual({
        created: false,
        duplicate: true,
        notification: existingNotification
      });

      expect(existingLookupQuery.eq).toHaveBeenCalledWith(
        'notification_type',
        'appointment_reminder_30m'
      );
      expect(existingLookupQuery.eq).toHaveBeenCalledWith(
        'slot_occurrence_key',
        'appointment-1:2026-05-10:10:20:00'
      );
      expect(existingLookupQuery.eq).toHaveBeenCalledWith(
        'appointment_id',
        'appointment-1'
      );
    });

    test('throws a clean error when notification creation fails', async () => {
      const insertQuery = createInsertQuery({
        data: null,
        error: { message: 'insert failed' }
      });

      supabase.from.mockReturnValueOnce(insertQuery);

      await expect(
        createNotification({
          notificationType: 'appointment_reminder_30m',
          userId: 'patient-1',
          appointmentId: 'appointment-1',
          recipientEmail: 'patient@example.com',
          subject: 'VitaQ appointment reminder'
        })
      ).rejects.toMatchObject({
        message: 'Failed to create email notification.',
        statusCode: 500
      });
    });
  });

  describe('sendAppointmentReminder', () => {
    test('creates, sends, and marks an appointment reminder as sent', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: 'patient@example.com'
          }
        },
        error: null
      });

      const pendingNotification = {
        id: 'notification-1',
        notification_type: 'appointment_reminder_30m',
        user_id: 'patient-1',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        recipient_email: 'patient@example.com',
        subject: 'VitaQ appointment reminder',
        status: 'pending',
        attempt_count: 0
      };

      const sentNotification = {
        ...pendingNotification,
        status: 'sent',
        provider_message_id: 'resend-message-1',
        attempt_count: 1,
        sent_at: '2026-05-10T08:00:00.000Z'
      };

      const insertQuery = createInsertQuery({
        data: pendingNotification,
        error: null
      });

      const updateQuery = createUpdateQuery({
        data: sentNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockResolvedValue({
        provider: 'resend',
        messageId: 'resend-message-1'
      });

      const result = await sendAppointmentReminder(reminderAppointment());

      expect(result.sent).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.notification.status).toBe('sent');

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'patient@example.com',
          subject: 'VitaQ appointment reminder',
          idempotencyKey:
            'appointment_reminder_30m:appointment-1:2026-05-10:10:20:00'
        })
      );

      expect(insertQuery.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          appointment_id: 'appointment-1',
          slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00'
        })
      ]);

      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sent',
          provider_message_id: 'resend-message-1',
          error_message: null,
          attempt_count: 1,
          sent_at: expect.any(String),
          updated_at: expect.any(String)
        })
      );
    });

    test('does not send an email when the notification is a duplicate', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: 'patient@example.com'
          }
        },
        error: null
      });

      const existingNotification = {
        id: 'notification-existing',
        notification_type: 'appointment_reminder_30m',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        status: 'sent'
      };

      const duplicateInsertQuery = createInsertQuery({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint'
        }
      });

      const existingLookupQuery = createLookupQuery({
        data: [existingNotification],
        error: null
      });

      supabase.from
        .mockReturnValueOnce(duplicateInsertQuery)
        .mockReturnValueOnce(existingLookupQuery);

      const result = await sendAppointmentReminder(reminderAppointment());

      expect(result).toEqual({
        sent: false,
        skipped: true,
        reason: 'duplicate',
        notification: existingNotification
      });

      expect(sendEmail).not.toHaveBeenCalled();
    });

    test('retries a duplicate appointment reminder when the previous notification failed', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: 'patient@example.com'
          }
        },
        error: null
      });

      const failedExistingNotification = {
        id: 'notification-existing',
        notification_type: 'appointment_reminder_30m',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        recipient_email: 'patient@example.com',
        subject: 'VitaQ appointment reminder',
        status: 'failed',
        attempt_count: 1
      };

      const sentNotification = {
        ...failedExistingNotification,
        status: 'sent',
        provider_message_id: 'resend-message-retry',
        attempt_count: 2
      };

      const duplicateInsertQuery = createInsertQuery({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint'
        }
      });

      const existingLookupQuery = createLookupQuery({
        data: [failedExistingNotification],
        error: null
      });

      const updateQuery = createUpdateQuery({
        data: sentNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(duplicateInsertQuery)
        .mockReturnValueOnce(existingLookupQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockResolvedValue({
        provider: 'resend',
        messageId: 'resend-message-retry'
      });

      const result = await sendAppointmentReminder(reminderAppointment());

      expect(result.sent).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.notification.status).toBe('sent');
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey:
            'appointment_reminder_30m:appointment-1:2026-05-10:10:20:00'
        })
      );
      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sent',
          attempt_count: 2
        })
      );
    });

    test('marks the notification as failed when the provider send fails', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: 'patient@example.com'
          }
        },
        error: null
      });

      const pendingNotification = {
        id: 'notification-1',
        notification_type: 'appointment_reminder_30m',
        user_id: 'patient-1',
        appointment_id: 'appointment-1',
        slot_occurrence_key: 'appointment-1:2026-05-10:10:20:00',
        recipient_email: 'patient@example.com',
        subject: 'VitaQ appointment reminder',
        status: 'pending',
        attempt_count: 2
      };

      const failedNotification = {
        ...pendingNotification,
        status: 'failed',
        error_message: 'Provider unavailable',
        attempt_count: 3
      };

      const insertQuery = createInsertQuery({
        data: pendingNotification,
        error: null
      });

      const updateQuery = createUpdateQuery({
        data: failedNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockRejectedValue(new Error('Provider unavailable'));

      const result = await sendAppointmentReminder(reminderAppointment());

      expect(result.sent).toBe(false);
      expect(result.failed).toBe(true);
      expect(result.notification.status).toBe('failed');

      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Provider unavailable',
          attempt_count: 3,
          updated_at: expect.any(String)
        })
      );
    });

    test('does not create a notification when the recipient email is missing', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'patient-1',
            email: null
          }
        },
        error: null
      });

      await expect(
        sendAppointmentReminder(reminderAppointment())
      ).rejects.toMatchObject({
        message: 'Recipient email is missing or invalid.',
        statusCode: 400
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('buildStaffDecisionEmail', () => {
    test('builds an approved staff request email', () => {
      const result = buildStaffDecisionEmail(staffRequest());

      expect(result.subject).toBe('VitaQ staff application approved');
      expect(result.text).toContain(
        'Your staff application for Rosebank Med Dental Centre has been approved.'
      );
    });

    test('builds a rejected staff request email', () => {
      const result = buildStaffDecisionEmail(
        staffRequest({
          status: 'rejected'
        })
      );

      expect(result.subject).toBe('VitaQ staff application rejected');
      expect(result.text).toContain(
        'Your staff application for Rosebank Med Dental Centre has been rejected.'
      );
    });
  });

  describe('sendStaffDecisionNotification', () => {
    test('creates, sends, and marks an approval notification as sent', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'staff-user-1',
            email: 'staff@example.com'
          }
        },
        error: null
      });

      const pendingNotification = {
        id: 'notification-staff-1',
        notification_type: 'staff_request_approved',
        user_id: 'staff-user-1',
        staff_request_id: 'staff-request-1',
        recipient_email: 'staff@example.com',
        subject: 'VitaQ staff application approved',
        status: 'pending',
        attempt_count: 0
      };

      const sentNotification = {
        ...pendingNotification,
        status: 'sent',
        provider_message_id: 'resend-message-staff',
        attempt_count: 1
      };

      const insertQuery = createInsertQuery({
        data: pendingNotification,
        error: null
      });

      const updateQuery = createUpdateQuery({
        data: sentNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockResolvedValue({
        provider: 'resend',
        messageId: 'resend-message-staff'
      });

      const result = await sendStaffDecisionNotification(staffRequest());

      expect(result.sent).toBe(true);
      expect(insertQuery.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          notification_type: 'staff_request_approved',
          user_id: 'staff-user-1',
          staff_request_id: 'staff-request-1',
          recipient_email: 'staff@example.com',
          subject: 'VitaQ staff application approved',
          status: 'pending',
          metadata: expect.objectContaining({
            clinic_id: 'clinic-1',
            staff_id: 'STAFF-001',
            status: 'approved'
          })
        })
      ]);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'staff@example.com',
          subject: 'VitaQ staff application approved',
          idempotencyKey: 'staff_request_approved:staff-request-1'
        })
      );
    });

    test('creates a rejected staff request notification type', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'staff-user-1',
            email: 'staff@example.com'
          }
        },
        error: null
      });

      const pendingNotification = {
        id: 'notification-staff-2',
        notification_type: 'staff_request_rejected',
        user_id: 'staff-user-1',
        staff_request_id: 'staff-request-1',
        recipient_email: 'staff@example.com',
        subject: 'VitaQ staff application rejected',
        status: 'pending',
        attempt_count: 0
      };

      const sentNotification = {
        ...pendingNotification,
        status: 'sent',
        provider_message_id: 'resend-message-staff',
        attempt_count: 1
      };

      const insertQuery = createInsertQuery({
        data: pendingNotification,
        error: null
      });
      const updateQuery = createUpdateQuery({
        data: sentNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockResolvedValue({
        provider: 'resend',
        messageId: 'resend-message-staff'
      });

      const result = await sendStaffDecisionNotification(
        staffRequest({
          status: 'rejected'
        })
      );

      expect(result.sent).toBe(true);
      expect(insertQuery.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          notification_type: 'staff_request_rejected',
          subject: 'VitaQ staff application rejected',
          metadata: expect.objectContaining({
            status: 'rejected'
          })
        })
      ]);
    });

    test('skips a duplicate staff decision notification that is already sent', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'staff-user-1',
            email: 'staff@example.com'
          }
        },
        error: null
      });

      const existingNotification = {
        id: 'notification-existing-staff',
        notification_type: 'staff_request_approved',
        staff_request_id: 'staff-request-1',
        status: 'sent'
      };

      const duplicateInsertQuery = createInsertQuery({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint'
        }
      });

      const existingLookupQuery = createLookupQuery({
        data: [existingNotification],
        error: null
      });

      supabase.from
        .mockReturnValueOnce(duplicateInsertQuery)
        .mockReturnValueOnce(existingLookupQuery);

      const result = await sendStaffDecisionNotification(staffRequest());

      expect(result).toEqual({
        sent: false,
        skipped: true,
        reason: 'duplicate',
        notification: existingNotification
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test('marks a staff decision notification as failed when the provider fails', async () => {
      supabase.auth.admin.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'staff-user-1',
            email: 'staff@example.com'
          }
        },
        error: null
      });

      const pendingNotification = {
        id: 'notification-staff-failed',
        notification_type: 'staff_request_approved',
        user_id: 'staff-user-1',
        staff_request_id: 'staff-request-1',
        recipient_email: 'staff@example.com',
        subject: 'VitaQ staff application approved',
        status: 'pending',
        attempt_count: 0
      };

      const failedNotification = {
        ...pendingNotification,
        status: 'failed',
        error_message: 'Provider unavailable',
        attempt_count: 1
      };

      const insertQuery = createInsertQuery({
        data: pendingNotification,
        error: null
      });
      const updateQuery = createUpdateQuery({
        data: failedNotification,
        error: null
      });

      supabase.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery);

      sendEmail.mockRejectedValue(new Error('Provider unavailable'));

      const result = await sendStaffDecisionNotification(staffRequest());

      expect(result.sent).toBe(false);
      expect(result.failed).toBe(true);
      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Provider unavailable',
          attempt_count: 1
        })
      );
    });
  });
});
