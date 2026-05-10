// Mock Supabase and the notification sender before importing the reminder job.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

jest.mock('../src/modules/notifications/notifications.service', () => ({
  sendAppointmentReminder: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const {
  sendAppointmentReminder
} = require('../src/modules/notifications/notifications.service');

const {
  buildJohannesburgSlotDateTime,
  isAppointmentInsideReminderWindow,
  fetchEligibleReminderAppointments,
  processAppointmentReminderJob
} = require('../src/modules/notifications/reminderJob.service');

/**
 * Creates a mocked Supabase select chain:
 * supabase.from(...).select(...).eq(...)
 */
function createAppointmentQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => Promise.resolve(result))
  };

  return query;
}

function appointmentRow(overrides = {}) {
  return {
    id: 'appointment-1',
    patient_id: 'patient-1',
    clinic_id: 'clinic-1',
    slot_id: 'slot-1',
    status: 'booked',
    created_at: '2026-05-10T07:00:00.000Z',
    updated_at: '2026-05-10T07:00:00.000Z',
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

describe('reminderJob.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildJohannesburgSlotDateTime', () => {
    test('converts Africa/Johannesburg local slot time to UTC', () => {
      const result = buildJohannesburgSlotDateTime('2026-05-10', '10:30:00');

      expect(result.toISOString()).toBe('2026-05-10T08:30:00.000Z');
    });

    test('returns null when date or time is invalid', () => {
      expect(buildJohannesburgSlotDateTime(null, '10:30:00')).toBeNull();
      expect(buildJohannesburgSlotDateTime('2026-05-10', null)).toBeNull();
      expect(buildJohannesburgSlotDateTime('bad-date', '10:30:00')).toBeNull();
    });
  });

  describe('isAppointmentInsideReminderWindow', () => {
    test('returns true when an appointment starts inside the next 30 minutes', () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const result = isAppointmentInsideReminderWindow(
        appointmentRow({
          slot: {
            id: 'slot-1',
            date: '2026-05-10',
            start_time: '10:20:00',
            end_time: '10:50:00'
          }
        }),
        now
      );

      expect(result).toBe(true);
    });

    test('returns false when an appointment is outside the 30-minute window', () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const result = isAppointmentInsideReminderWindow(
        appointmentRow({
          slot: {
            id: 'slot-1',
            date: '2026-05-10',
            start_time: '10:45:00',
            end_time: '11:15:00'
          }
        }),
        now
      );

      expect(result).toBe(false);
    });

    test('returns false when an appointment has already started', () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const result = isAppointmentInsideReminderWindow(
        appointmentRow({
          slot: {
            id: 'slot-1',
            date: '2026-05-10',
            start_time: '09:55:00',
            end_time: '10:25:00'
          }
        }),
        now
      );

      expect(result).toBe(false);
    });

    test('returns false when slot data is missing', () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const result = isAppointmentInsideReminderWindow(
        appointmentRow({
          slot: null
        }),
        now
      );

      expect(result).toBe(false);
    });
  });

  describe('fetchEligibleReminderAppointments', () => {
    test('fetches booked appointments and returns only appointments inside the reminder window', async () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const appointmentInsideWindow = appointmentRow({
        id: 'appointment-inside',
        slot: {
          id: 'slot-inside',
          date: '2026-05-10',
          start_time: '10:20:00',
          end_time: '10:50:00'
        }
      });

      const appointmentOutsideWindow = appointmentRow({
        id: 'appointment-outside',
        slot: {
          id: 'slot-outside',
          date: '2026-05-10',
          start_time: '10:45:00',
          end_time: '11:15:00'
        }
      });

      const appointmentAlreadyStarted = appointmentRow({
        id: 'appointment-past',
        slot: {
          id: 'slot-past',
          date: '2026-05-10',
          start_time: '09:50:00',
          end_time: '10:20:00'
        }
      });

      const appointmentQuery = createAppointmentQuery({
        data: [
          appointmentInsideWindow,
          appointmentOutsideWindow,
          appointmentAlreadyStarted
        ],
        error: null
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);

      const result = await fetchEligibleReminderAppointments(now);

      expect(supabase.from).toHaveBeenCalledWith('appointments');
      expect(appointmentQuery.eq).toHaveBeenCalledWith('status', 'booked');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('appointment-inside');
      expect(result[0].appointment_start_at).toBe('2026-05-10T08:20:00.000Z');
    });

    test('normalizes array-based Supabase relationship results safely', async () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const appointmentQuery = createAppointmentQuery({
        data: [
          appointmentRow({
            id: 'appointment-array-relation',
            clinic: [
              {
                id: 'clinic-1',
                name: 'Rosebank Med Dental Centre'
              }
            ],
            slot: [
              {
                id: 'slot-1',
                date: '2026-05-10',
                start_time: '10:10:00',
                end_time: '10:40:00'
              }
            ]
          })
        ],
        error: null
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);

      const result = await fetchEligibleReminderAppointments(now);

      expect(result).toHaveLength(1);
      expect(result[0].clinic).toEqual({
        id: 'clinic-1',
        name: 'Rosebank Med Dental Centre'
      });
      expect(result[0].slot).toEqual({
        id: 'slot-1',
        date: '2026-05-10',
        start_time: '10:10:00',
        end_time: '10:40:00'
      });
    });

    test('throws a clean error when appointment loading fails', async () => {
      const appointmentQuery = createAppointmentQuery({
        data: null,
        error: { message: 'database failed' }
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);

      await expect(fetchEligibleReminderAppointments()).rejects.toMatchObject({
        message: 'Failed to fetch appointment reminders.',
        statusCode: 500
      });
    });
  });

  describe('processAppointmentReminderJob', () => {
    test('sends reminders and returns the expected summary counts', async () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const appointmentQuery = createAppointmentQuery({
        data: [
          appointmentRow({
            id: 'appointment-sent',
            slot: {
              id: 'slot-1',
              date: '2026-05-10',
              start_time: '10:05:00',
              end_time: '10:35:00'
            }
          }),
          appointmentRow({
            id: 'appointment-failed',
            slot: {
              id: 'slot-2',
              date: '2026-05-10',
              start_time: '10:10:00',
              end_time: '10:40:00'
            }
          }),
          appointmentRow({
            id: 'appointment-duplicate',
            slot: {
              id: 'slot-3',
              date: '2026-05-10',
              start_time: '10:15:00',
              end_time: '10:45:00'
            }
          })
        ],
        error: null
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);

      sendAppointmentReminder
        .mockResolvedValueOnce({
          sent: true,
          skipped: false
        })
        .mockResolvedValueOnce({
          sent: false,
          skipped: false,
          failed: true
        })
        .mockResolvedValueOnce({
          sent: false,
          skipped: true,
          reason: 'duplicate'
        });

      const result = await processAppointmentReminderJob({ now });

      expect(result).toEqual({
        eligible: 3,
        created: 2,
        sent: 1,
        failed: 1
      });

      expect(sendAppointmentReminder).toHaveBeenCalledTimes(3);
      expect(sendAppointmentReminder).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 'appointment-sent'
        })
      );
    });

    test('counts thrown notification errors as failed sends', async () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const appointmentQuery = createAppointmentQuery({
        data: [
          appointmentRow({
            id: 'appointment-error',
            slot: {
              id: 'slot-1',
              date: '2026-05-10',
              start_time: '10:05:00',
              end_time: '10:35:00'
            }
          })
        ],
        error: null
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);
      sendAppointmentReminder.mockRejectedValueOnce(new Error('Email failed'));

      const result = await processAppointmentReminderJob({ now });

      expect(result).toEqual({
        eligible: 1,
        created: 0,
        sent: 0,
        failed: 1
      });
    });

    test('returns zero counts when no appointments are eligible', async () => {
      const now = new Date('2026-05-10T08:00:00.000Z');

      const appointmentQuery = createAppointmentQuery({
        data: [
          appointmentRow({
            id: 'appointment-too-late',
            slot: {
              id: 'slot-1',
              date: '2026-05-10',
              start_time: '11:00:00',
              end_time: '11:30:00'
            }
          })
        ],
        error: null
      });

      supabase.from.mockReturnValueOnce(appointmentQuery);

      const result = await processAppointmentReminderJob({ now });

      expect(result).toEqual({
        eligible: 0,
        created: 0,
        sent: 0,
        failed: 0
      });

      expect(sendAppointmentReminder).not.toHaveBeenCalled();
    });
  });
});