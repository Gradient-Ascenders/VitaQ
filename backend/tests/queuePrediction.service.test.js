jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');

const {
  getPredictedWaitTimeForQueueEntry
} = require('../src/modules/queue/queuePrediction.service');

/**
 * Creates a fake Supabase query builder.
 * This version includes the extra query methods used by the prediction service.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    lt: jest.fn(() => query),
    in: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    update: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('queuePrediction.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when queue entry id or patient id is missing', async () => {
    await expect(
      getPredictedWaitTimeForQueueEntry({
        queueEntryId: 'queue-1'
      })
    ).rejects.toMatchObject({
      message: 'queue entry id and patient id are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws an error when the queue entry does not exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'No rows found' }
      })
    );

    await expect(
      getPredictedWaitTimeForQueueEntry({
        queueEntryId: 'queue-1',
        patientId: 'patient-1'
      })
    ).rejects.toMatchObject({
      message: 'Queue entry not found.',
      statusCode: 404
    });
  });

  test('blocks a patient from viewing another patient queue prediction', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          id: 'queue-1',
          clinic_id: 'clinic-1',
          patient_id: 'different-patient',
          queue_number: 2,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'waiting',
          estimated_wait_minutes: 0,
          joined_at: '2026-04-16T08:00:00.000Z',
          created_at: '2026-04-16T08:00:00.000Z',
          updated_at: '2026-04-16T08:00:00.000Z'
        },
        error: null
      })
    );

    await expect(
      getPredictedWaitTimeForQueueEntry({
        queueEntryId: 'queue-1',
        patientId: 'patient-1'
      })
    ).rejects.toMatchObject({
      message: 'You can only view your own queue prediction.',
      statusCode: 403
    });
  });

  test('returns zero wait time for a completed queue entry', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          id: 'queue-1',
          clinic_id: 'clinic-1',
          patient_id: 'patient-1',
          queue_number: 1,
          queue_date: '2026-04-16',
          source: 'appointment',
          status: 'complete',
          estimated_wait_minutes: 0,
          joined_at: '2026-04-16T08:00:00.000Z',
          created_at: '2026-04-16T08:00:00.000Z',
          updated_at: '2026-04-16T08:45:00.000Z'
        },
        error: null
      })
    );

    const result = await getPredictedWaitTimeForQueueEntry({
      queueEntryId: 'queue-1',
      patientId: 'patient-1'
    });

    expect(result).toMatchObject({
      queue_entry_id: 'queue-1',
      status: 'complete',
      predicted_wait_minutes: 0,
      active_patients_ahead: 0,
      basis: 'queue_entry_not_active',
      persisted: false
    });

    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test('returns zero wait time and persists zero when patient is already in consultation', async () => {
    const updateQuery = createMockQuery({
      data: null,
      error: null
    });

    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'queue-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            queue_number: 1,
            queue_date: '2026-04-16',
            source: 'appointment',
            status: 'in_consultation',
            estimated_wait_minutes: 15,
            joined_at: '2026-04-16T08:00:00.000Z',
            consultation_started_at: '2026-04-16T08:15:00.000Z',
            created_at: '2026-04-16T08:00:00.000Z',
            updated_at: '2026-04-16T08:15:00.000Z'
          },
          error: null
        })
      )
      .mockReturnValueOnce(updateQuery);

    const result = await getPredictedWaitTimeForQueueEntry({
      queueEntryId: 'queue-1',
      patientId: 'patient-1'
    });

    expect(result).toMatchObject({
      queue_entry_id: 'queue-1',
      status: 'in_consultation',
      predicted_wait_minutes: 0,
      basis: 'patient_already_in_consultation',
      persisted: true
    });

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estimated_wait_minutes: 0
      })
    );
  });

  test('uses default fallback when no historical data is available', async () => {
    const queueEntry = {
      id: 'queue-3',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      queue_number: 3,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 0,
      joined_at: '2026-04-16T08:30:00.000Z',
      created_at: '2026-04-16T08:30:00.000Z',
      updated_at: '2026-04-16T08:30:00.000Z'
    };

    const activeAhead = [
      {
        id: 'queue-1',
        queue_number: 1,
        status: 'waiting'
      },
      {
        id: 'queue-2',
        queue_number: 2,
        status: 'in_consultation'
      }
    ];

    const updateQuery = createMockQuery({
      data: null,
      error: null
    });

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: activeAhead, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(updateQuery);

    const result = await getPredictedWaitTimeForQueueEntry({
      queueEntryId: 'queue-3',
      patientId: 'patient-1'
    });

    expect(result).toMatchObject({
      queue_entry_id: 'queue-3',
      predicted_wait_minutes: 25,
      active_patients_ahead: 2,
      waiting_ahead: 1,
      in_consultation_ahead: 1,
      average_consultation_minutes: 15,
      basis: 'default_fallback',
      sample_size: 0,
      persisted: true
    });

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estimated_wait_minutes: 25
      })
    );
  });

  test('uses clinic history to calculate predicted wait time', async () => {
    const queueEntry = {
      id: 'queue-4',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      queue_number: 4,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 0,
      joined_at: '2026-04-16T08:30:00.000Z',
      created_at: '2026-04-16T08:30:00.000Z',
      updated_at: '2026-04-16T08:30:00.000Z'
    };

    const activeAhead = [
      {
        id: 'queue-1',
        queue_number: 1,
        status: 'waiting'
      },
      {
        id: 'queue-2',
        queue_number: 2,
        status: 'waiting'
      },
      {
        id: 'queue-3',
        queue_number: 3,
        status: 'in_consultation'
      }
    ];

    const historicalRows = [
      {
        id: 'history-1',
        clinic_id: 'clinic-1',
        queue_date: '2026-04-15',
        status: 'complete',
        joined_at: '2026-04-15T08:00:00.000Z',
        consultation_started_at: '2026-04-15T08:10:00.000Z',
        completed_at: '2026-04-15T08:30:00.000Z',
        created_at: '2026-04-15T08:00:00.000Z'
      },
      {
        id: 'history-2',
        clinic_id: 'clinic-1',
        queue_date: '2026-04-14',
        status: 'complete',
        joined_at: '2026-04-14T13:00:00.000Z',
        consultation_started_at: '2026-04-14T13:10:00.000Z',
        completed_at: '2026-04-14T13:50:00.000Z',
        created_at: '2026-04-14T13:00:00.000Z'
      }
    ];

    const updateQuery = createMockQuery({
      data: null,
      error: null
    });

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: activeAhead, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: historicalRows, error: null }))
      .mockReturnValueOnce(updateQuery);

    const result = await getPredictedWaitTimeForQueueEntry({
      queueEntryId: 'queue-4',
      patientId: 'patient-1'
    });

    expect(result).toMatchObject({
      queue_entry_id: 'queue-4',
      predicted_wait_minutes: 75,
      active_patients_ahead: 3,
      waiting_ahead: 2,
      in_consultation_ahead: 1,
      average_consultation_minutes: 30,
      basis: 'clinic_history',
      sample_size: 2,
      persisted: true
    });
  });

  test('returns persisted false when saving the prediction fails', async () => {
    const queueEntry = {
      id: 'queue-2',
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      queue_number: 2,
      queue_date: '2026-04-16',
      source: 'appointment',
      status: 'waiting',
      estimated_wait_minutes: 0,
      joined_at: '2026-04-16T08:30:00.000Z',
      created_at: '2026-04-16T08:30:00.000Z',
      updated_at: '2026-04-16T08:30:00.000Z'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: queueEntry, error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: [{ id: 'queue-1', queue_number: 1, status: 'waiting' }],
          error: null
        })
      )
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Update failed' }
        })
      );

    const result = await getPredictedWaitTimeForQueueEntry({
      queueEntryId: 'queue-2',
      patientId: 'patient-1'
    });

    expect(result).toMatchObject({
      predicted_wait_minutes: 15,
      persisted: false,
      basis: 'default_fallback'
    });
  });
});