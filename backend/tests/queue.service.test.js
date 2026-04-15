// Mock the Supabase client before importing the queue service.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const { joinQueueFromAppointment } = require('../src/modules/queue/queue.service');

/**
 * Creates a fake Supabase query builder.
 * This lets us test the service without touching the real database.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    limit: jest.fn(() => query),
    insert: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('joinQueueFromAppointment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when patient_id or appointment_id is missing', async () => {
    await expect(
      joinQueueFromAppointment({ patientId: 'patient-1' })
    ).rejects.toMatchObject({
      message: 'patient_id and appointment_id are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws an error when the appointment does not exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({ data: null, error: { message: 'No rows found' } })
    );

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'Appointment not found.',
      statusCode: 404
    });
  });

  test('blocks a patient from joining another patient appointment', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          id: 'appointment-1',
          patient_id: 'different-patient',
          clinic_id: 'clinic-1',
          status: 'booked',
          slot: { date: '2026-04-16' },
          clinic: { name: 'Test Clinic' }
        },
        error: null
      })
    );

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'You cannot join the queue for another patient.',
      statusCode: 403
    });
  });

  test('blocks duplicate queue entries for the same appointment', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'appointment-1',
            patient_id: 'patient-1',
            clinic_id: 'clinic-1',
            status: 'booked',
            slot: { date: '2026-04-16' },
            clinic: { name: 'Test Clinic' }
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [{ id: 'queue-1' }],
          error: null
        })
      );

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'This appointment has already joined the queue.',
      statusCode: 409
    });
  });

  test('creates and returns a queue entry for a valid appointment', async () => {
    const appointment = {
      id: 'appointment-1',
      patient_id: 'patient-1',
      clinic_id: 'clinic-1',
      status: 'booked',
      slot: {
        date: '2026-04-16',
        start_time: '11:30:00',
        end_time: '12:00:00'
      },
      clinic: {
        name: 'Test Clinic'
      }
    };

    const queueEntry = {
      id: 'queue-1',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 1,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 0
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: appointment, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createMockQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }));

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.queue_entry).toEqual(queueEntry);
    expect(result.position).toBe(1);
    expect(result.queue_entry.status).toBe('waiting');
    expect(result.queue_entry.source).toBe('appointment');
  });
});