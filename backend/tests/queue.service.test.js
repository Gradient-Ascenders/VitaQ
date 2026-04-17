// Mock the Supabase client before importing the queue service.
// This keeps the tests fast and prevents real database calls.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');

const {
  joinQueueFromAppointment,
  fetchPatientQueueStatus,
  fetchStaffQueue,
  updateQueueEntryStatus
} = require('../src/modules/queue/queue.service');

/**
 * Creates a fake Supabase query builder.
 * This lets us test the service without touching the real database.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    insert: jest.fn(() => query),
    update: jest.fn(() => query),
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

  test('blocks appointments that are not booked', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          id: 'appointment-1',
          patient_id: 'patient-1',
          clinic_id: 'clinic-1',
          status: 'cancelled',
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
      message: 'Only booked appointments can join the queue.',
      statusCode: 409
    });
  });

  test('blocks duplicate queue entries for the same appointment when the entry belongs to another patient', async () => {
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
          data: [
            {
              id: 'queue-1',
              clinic_id: 'clinic-1',
              patient_id: 'different-patient',
              appointment_id: 'appointment-1',
              queue_number: 1,
              queue_date: '2026-04-16',
              source: 'appointment',
              status: 'waiting',
              estimated_wait_minutes: 0
            }
          ],
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

  test('throws an error when duplicate-check query fails', async () => {
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
          data: null,
          error: { message: 'Database unavailable' }
        })
      );

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'Failed to check existing queue entry.',
      statusCode: 500
    });
  });

  test('throws an error when queue number generation fails', async () => {
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
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ count: null, error: { message: 'DB error' } }));

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'Failed to generate queue number.',
      statusCode: 500
    });
  });

  test('throws an error when queue entry insertion fails', async () => {
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

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: appointment, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Insert failed' }
        })
      );

    await expect(
      joinQueueFromAppointment({
        patientId: 'patient-1',
        appointmentId: 'appointment-1'
      })
    ).rejects.toMatchObject({
      message: 'Failed to join the queue.',
      statusCode: 500
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
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }));

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.queue_entry).toMatchObject(queueEntry);
    expect(result.position).toBe(1);
    expect(result.queue_entry.status).toBe('waiting');
    expect(result.queue_entry.source).toBe('appointment');
  });

  test('returns the existing queue entry for a duplicate join by the same patient', async () => {
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

    const existingEntry = {
      id: 'queue-2',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 2,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 90,
      created_at: '2026-04-16T08:30:00.000Z',
      updated_at: '2026-04-16T08:30:00.000Z'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: appointment, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [existingEntry], error: null }))
      .mockReturnValueOnce(
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
              status: 'in_consultation',
              estimated_wait_minutes: 0
            },
            existingEntry
          ],
          error: null
        })
      );

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.position).toBe(2);
    expect(result.queue_entry).toMatchObject({
      id: 'queue-2',
      queue_number: 2,
      status: 'waiting',
      estimated_wait_minutes: 15
    });
  });

  test('uses the highest existing queue number when creating a new queue entry', async () => {
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
      id: 'queue-9',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 9,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 30
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: appointment, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [{ queue_number: 8 }], error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: [
            {
              id: 'queue-4',
              clinic_id: 'clinic-1',
              patient_id: 'patient-a',
              appointment_id: 'appointment-a',
              queue_number: 4,
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
              id: 'queue-8',
              clinic_id: 'clinic-1',
              patient_id: 'patient-b',
              appointment_id: 'appointment-b',
              queue_number: 8,
              queue_date: '2026-04-16',
              source: 'appointment',
              status: 'waiting',
              estimated_wait_minutes: 15,
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
      )
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }));

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.position).toBe(3);
    expect(result.queue_entry.queue_number).toBe(9);
    expect(result.queue_entry.estimated_wait_minutes).toBe(30);
  });

  test('calculates live position from queue number instead of appointment time', async () => {
    const appointment = {
      id: 'appointment-1',
      patient_id: 'patient-1',
      clinic_id: 'clinic-1',
      status: 'booked',
      slot: {
        date: '2026-04-16',
        start_time: '09:30:00',
        end_time: '10:00:00'
      },
      clinic: {
        name: 'Test Clinic'
      }
    };

    const queueEntry = {
      id: 'queue-3',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 3,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 15
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: appointment, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [{ queue_number: 2 }], error: null }))
      .mockReturnValueOnce(
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
              patient_id: 'patient-b',
              appointment_id: 'appointment-b',
              queue_number: 2,
              queue_date: '2026-04-16',
              source: 'appointment',
              status: 'waiting',
              estimated_wait_minutes: 15,
              appointment: {
                slot: {
                  start_time: '11:00:00',
                  end_time: '11:30:00'
                }
              }
            }
          ],
          error: null
        })
      )
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }));

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.queue_entry.queue_number).toBe(3);
    expect(result.position).toBe(3);
    expect(result.queue_entry.estimated_wait_minutes).toBe(30);
  });

  test('falls back to the local current date when the appointment slot date is missing', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 16, 10, 30, 0).getTime());

    const appointment = {
      id: 'appointment-1',
      patient_id: 'patient-1',
      clinic_id: 'clinic-1',
      status: 'booked',
      slot: {
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
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(createMockQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }));

    const result = await joinQueueFromAppointment({
      patientId: 'patient-1',
      appointmentId: 'appointment-1'
    });

    expect(result.queue_entry.queue_date).toBe('2026-04-16');
    expect(result.queue_entry).toMatchObject(queueEntry);
    expect(result.position).toBe(1);
    expect(result.queue_entry.status).toBe('waiting');
    expect(result.queue_entry.source).toBe('appointment');
    expect(result.clinic).toEqual(appointment.clinic);
    expect(result.slot).toEqual(appointment.slot);

    jest.useRealTimers();
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

  test('returns waiting queue status with live position and wait time when consultation is ahead', async () => {
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
            status: 'in_consultation',
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
            patient_id: 'patient-b',
            appointment_id: 'appointment-c',
            queue_number: 3,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'waiting',
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
    expect(result.queue_entries[0]).toMatchObject({
      id: 'queue-1',
      position: 1,
      status: 'in_consultation'
    });
    expect(result.queue_entries[1]).toMatchObject({
      position: 2,
      queue_number: 2,
      appointment_time: '08:30',
      is_current_patient: true
    });
    expect(result.queue_entries[2]).toMatchObject({
      id: 'queue-3',
      position: 3,
      status: 'waiting'
    });
  });

 test('ignores completed entries ahead when calculating patient position', async () => {
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
          status: 'complete',
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
          patient_id: 'patient-b',
          appointment_id: 'appointment-b',
          queue_number: 2,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
          estimated_wait_minutes: 0,
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
          patient_id: 'patient-1',
          appointment_id: 'appointment-1',
          queue_number: 3,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
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

  expect(result.position).toBe(2);
  expect(result.queue_entry.estimated_wait_minutes).toBe(15);
});

test('ignores cancelled entries ahead when calculating patient position', async () => {
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
          status: 'cancelled',
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
          patient_id: 'patient-b',
          appointment_id: 'appointment-b',
          queue_number: 2,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
          estimated_wait_minutes: 0,
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
          patient_id: 'patient-1',
          appointment_id: 'appointment-1',
          queue_number: 3,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
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

  expect(result.position).toBe(2);
  expect(result.queue_entry.estimated_wait_minutes).toBe(15);
});

test('orders live queue positions by queue number, not appointment time', async () => {
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
              start_time: '11:00:00',
              end_time: '11:30:00'
            }
          }
        },
        {
          id: 'queue-2',
          clinic_id: 'clinic-1',
          patient_id: 'patient-b',
          appointment_id: 'appointment-b',
          queue_number: 2,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
          estimated_wait_minutes: 15,
          appointment: {
            slot: {
              start_time: '08:00:00',
              end_time: '08:30:00'
            }
          }
        },
        {
          id: 'queue-3',
          clinic_id: 'clinic-1',
          patient_id: 'patient-1',
          appointment_id: 'appointment-1',
          queue_number: 3,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
          estimated_wait_minutes: 30,
          appointment: {
            slot: {
              start_time: '09:30:00',
              end_time: '10:00:00'
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

  expect(result.position).toBe(3);
  expect(result.queue_entry.queue_number).toBe(3);
  expect(result.queue_entries.map((entry) => entry.id)).toEqual([
    'queue-1',
    'queue-2',
    'queue-3'
  ]);
  expect(result.queue_entries[2]).toMatchObject({
    id: 'queue-3',
    position: 3,
    queue_number: 3,
    appointment_time: '09:30',
    is_current_patient: true
  });
});

  test('returns complete status without a waiting position', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-5',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: 'appointment-5',
            queue_number: 5,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'complete',
            estimated_wait_minutes: 0,
            appointment: {
              slot: {
                start_time: '10:30:00',
                end_time: '11:00:00'
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
    expect(result.queue_entry.status).toBe('complete');
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

  test('omits live position for completed queue entries in the queue list', async () => {
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
            status: 'complete',
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
            estimated_wait_minutes: 0,
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

    expect(result.position).toBe(1);
    expect(result.queue_entries[0]).toMatchObject({
      id: 'queue-1',
      position: null,
      status: 'complete'
    });
    expect(result.queue_entries[1]).toMatchObject({
      id: 'queue-2',
      position: 1,
      status: 'waiting'
    });
  });

  test('returns walk-in label when an entry has no appointment slot time', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-7',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: null,
            queue_number: 7,
            queue_date: '2026-04-16',
            source: 'walk_in',
            status: 'waiting',
            estimated_wait_minutes: 0,
            appointment: null
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

    expect(result.queue_entries[0]).toMatchObject({
      appointment_time: 'Walk-in',
      is_current_patient: true
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

describe('fetchStaffQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when staff user id or date is missing', async () => {
    await expect(
      fetchStaffQueue({
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'staff user id and date are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('returns staff queue entries filtered by the staff clinic and date', async () => {
    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-1',
      status: 'approved'
    };

    const clinic = {
      id: 'clinic-1',
      name: 'Tembisa Community Clinic'
    };

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: approvedStaffRequest,
        error: null
      })
    );

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: clinic,
        error: null
      })
    );

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'queue-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: 'appointment-1',
            queue_number: 1,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'waiting',
            estimated_wait_minutes: 0,
            created_at: '2026-04-16T08:00:00Z',
            updated_at: '2026-04-16T08:00:00Z',
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
            patient_id: 'patient-2',
            appointment_id: 'appointment-2',
            queue_number: 2,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'in_consultation',
            estimated_wait_minutes: 0,
            created_at: '2026-04-16T08:05:00Z',
            updated_at: '2026-04-16T08:05:00Z',
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

    const result = await fetchStaffQueue({
      staffUserId: 'staff-1',
      queueDate: '2026-04-16'
    });

    expect(result.clinic).toEqual(clinic);
    expect(result.clinic_id).toBe('clinic-1');
    expect(result.queue_date).toBe('2026-04-16');
    expect(result.queue_summary).toEqual({
      total: 2,
      waiting: 1,
      in_consultation: 1,
      complete: 0
    });

    expect(result.queue_entries[0]).toMatchObject({
      id: 'queue-1',
      queue_number: 1,
      status: 'waiting',
      live_position: 1,
      appointment_time: '08:00:00'
    });

    expect(result.queue_entries[1]).toMatchObject({
      id: 'queue-2',
      queue_number: 2,
      status: 'in_consultation',
      live_position: null,
      appointment_time: '08:30:00'
    });
  });

  test('throws an error when the staff queue query fails', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'clinic-1',
            name: 'Tembisa Community Clinic'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Database unavailable' }
        })
      );

    await expect(
      fetchStaffQueue({
        staffUserId: 'staff-1',
        queueDate: '2026-04-16'
      })
    ).rejects.toMatchObject({
      message: 'Failed to fetch staff queue.',
      statusCode: 500
    });
  });

  test('throws an error when the staff member does not have approved access', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'No approved staff request found' }
      })
    );

    await expect(
      fetchStaffQueue({
        staffUserId: 'staff-1',
        queueDate: '2026-04-16'
      })
    ).rejects.toMatchObject({
      message: 'Approved staff access is required.',
      statusCode: 403
    });
  });

  test('throws an error when the assigned clinic cannot be loaded', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Clinic lookup failed' }
        })
      );

    await expect(
      fetchStaffQueue({
        staffUserId: 'staff-1',
        queueDate: '2026-04-16'
      })
    ).rejects.toMatchObject({
      message: 'Failed to fetch assigned clinic.',
      statusCode: 500
    });
  });
});

describe('updateQueueEntryStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when queue entry id, status, or staff user id is missing', async () => {
    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'in_consultation'
      })
    ).rejects.toMatchObject({
      message: 'queue entry id, status, and staff user id are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid queue statuses', async () => {
    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'paused',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'Invalid queue status.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('updates and returns a queue entry status for staff assigned to the same clinic', async () => {
    const existingEntry = {
      id: 'queue-1',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 1,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 0,
      created_at: '2026-04-16T08:00:00Z',
      updated_at: '2026-04-16T08:00:00Z'
    };

    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-1',
      status: 'approved'
    };

    const updatedEntry = {
      ...existingEntry,
      status: 'in_consultation',
      updated_at: '2026-04-16T08:15:00Z'
    };

    supabase.from
      // First query: fetch the existing queue entry.
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))

      // Second query: fetch the approved staff request.
      .mockReturnValueOnce(createMockQuery({ data: approvedStaffRequest, error: null }))

      // Third query: update and return the queue entry.
      .mockReturnValueOnce(createMockQuery({ data: updatedEntry, error: null }));

    const result = await updateQueueEntryStatus({
      entryId: 'queue-1',
      status: 'in_consultation',
      staffUserId: 'staff-1'
    });

    expect(result).toEqual(updatedEntry);
    expect(result.status).toBe('in_consultation');
    expect(supabase.from).toHaveBeenCalledWith('queue_entries');
    expect(supabase.from).toHaveBeenCalledWith('staff_requests');
  });

  test('blocks staff from updating a queue entry for another clinic', async () => {
    const existingEntry = {
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

    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-2',
      status: 'approved'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedStaffRequest, error: null }));

    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'in_consultation',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'You can only update queue entries for your assigned clinic.',
      statusCode: 403
    });
  });

  test('rejects invalid status transitions', async () => {
    const existingEntry = {
      id: 'queue-1',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 1,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'complete',
      estimated_wait_minutes: 0
    };

    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-1',
      status: 'approved'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedStaffRequest, error: null }));

    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'waiting',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'Cannot change queue status from complete to waiting.',
      statusCode: 409
    });
  });

  test('returns the existing entry when the requested status is already set', async () => {
    const existingEntry = {
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

    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-1',
      status: 'approved'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedStaffRequest, error: null }));

    const result = await updateQueueEntryStatus({
      entryId: 'queue-1',
      status: 'waiting',
      staffUserId: 'staff-1'
    });

    expect(result).toEqual(existingEntry);
  });

  test('throws an error when the queue entry does not exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'No rows found' }
      })
    );

    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'in_consultation',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'Queue entry not found.',
      statusCode: 404
    });
  });

  test('throws an error when the staff member is not approved', async () => {
    const existingEntry = {
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
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'No approved staff request found' }
        })
      );

    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'in_consultation',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'Approved staff access is required.',
      statusCode: 403
    });
  });

  test('throws an error when the status update fails', async () => {
    const existingEntry = {
      id: 'queue-1',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      appointment_id: 'appointment-1',
      queue_number: 1,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'in_consultation',
      estimated_wait_minutes: 0
    };

    const approvedStaffRequest = {
      id: 'staff-request-1',
      user_id: 'staff-1',
      clinic_id: 'clinic-1',
      status: 'approved'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: existingEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedStaffRequest, error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Update failed' }
        })
      );

    await expect(
      updateQueueEntryStatus({
        entryId: 'queue-1',
        status: 'complete',
        staffUserId: 'staff-1'
      })
    ).rejects.toMatchObject({
      message: 'Failed to update queue status.',
      statusCode: 500
    });
  });
});
