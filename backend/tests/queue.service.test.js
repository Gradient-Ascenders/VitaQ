// Mock the Supabase client before importing the queue service.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const {
  joinQueueFromAppointment,
  fetchPatientQueueStatus
} = require('../src/modules/queue/queue.service');

/**
 * Creates a fake Supabase query builder.
 * This lets us test the service without touching the real database.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
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

describe('fetchPatientQueueStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when patient_id, clinic_id, or date is missing', async () => {
    await expect(
      fetchPatientQueueStatus({
        patientId: 'patient-1',
        clinicId: 'clinic-1'
      })
    ).rejects.toMatchObject({
      message: 'patient_id, clinic_id, and date are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('returns waiting queue status with live position and wait time', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-a',
            appointment_id: 'appointment-a',
            queue_number: 1,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'waiting',
            estimated_wait_minutes: 0,
            appointment: {
              slot: {
                start_time: '08:00:00',
                end_time: '08:30:00'
              }
            }
          },
          {
            id: 'queue-2',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: 'appointment-1',
            queue_number: 2,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'waiting',
            estimated_wait_minutes: 90,
            appointment: {
              slot: {
                start_time: '08:30:00',
                end_time: '09:00:00'
              }
            }
          },
          {
            id: 'queue-3',
            clinic_id: 'clinic-1',
            patient_id: 'patient-c',
            appointment_id: 'appointment-c',
            queue_number: 3,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'in_consultation',
            estimated_wait_minutes: 0,
            appointment: {
              slot: {
                start_time: '09:00:00',
                end_time: '09:30:00'
              }
            }
          }
        ],
        error: null
      })
    );

    const result = await fetchPatientQueueStatus({
      patientId: 'patient-1',
      clinicId: 'clinic-1',
      queueDate: '2026-04-16'
    });

    expect(result.is_in_queue).toBe(true);
    expect(result.position).toBe(2);
    expect(result.queue_entry.queue_number).toBe(2);
    expect(result.queue_entry.estimated_wait_minutes).toBe(15);
    expect(result.queue_summary).toEqual({
      total: 3,
      waiting: 2,
      in_consultation: 1,
      complete: 0
    });
    expect(result.queue_entries[1]).toMatchObject({
      position: 2,
      queue_number: 2,
      appointment_time: '08:30',
      is_current_patient: true
    });
  });

  test('returns in consultation status without a waiting position', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-2',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: 'appointment-1',
            queue_number: 2,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'in_consultation',
            estimated_wait_minutes: 15,
            appointment: {
              slot: {
                start_time: '08:30:00',
                end_time: '09:00:00'
              }
            }
          }
        ],
        error: null
      })
    );

    const result = await fetchPatientQueueStatus({
      patientId: 'patient-1',
      clinicId: 'clinic-1',
      queueDate: '2026-04-16'
    });

    expect(result.is_in_queue).toBe(true);
    expect(result.position).toBeNull();
    expect(result.queue_entry.status).toBe('in_consultation');
    expect(result.queue_entry.estimated_wait_minutes).toBe(0);
  });

  test('returns not-in-queue state when the patient entry is missing', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-a',
            appointment_id: 'appointment-a',
            queue_number: 1,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'waiting',
            estimated_wait_minutes: 0,
            appointment: {
              slot: {
                start_time: '08:00:00',
                end_time: '08:30:00'
              }
            }
          }
        ],
        error: null
      })
    );

    const result = await fetchPatientQueueStatus({
      patientId: 'patient-1',
      clinicId: 'clinic-1',
      queueDate: '2026-04-16'
    });

    expect(result).toEqual({
      is_in_queue: false,
      position: null,
      queue_entry: null,
      queue_summary: {
        total: 1,
        waiting: 1,
        in_consultation: 0,
        complete: 0
      },
      queue_entries: [
        {
          id: 'queue-1',
          position: 1,
          queue_number: 1,
          status: 'waiting',
          appointment_time: '08:00',
          is_current_patient: false
        }
      ]
    });
  });

  test('throws an error when the queue query fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Database unavailable' }
      })
    );

    await expect(
      fetchPatientQueueStatus({
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        queueDate: '2026-04-16'
      })
    ).rejects.toMatchObject({
      message: 'Failed to fetch queue status.',
      statusCode: 500
    });
  });
});
