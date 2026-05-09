// Mock the Supabase client before importing the analytics service.
// This keeps the tests fast and avoids real database calls.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const { fetchWaitTimeAnalytics } = require('../src/modules/analytics/analytics.service');

/**
 * Creates a fake Supabase query builder.
 * The analytics service chains select/filters/order, then awaits the query.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('fetchWaitTimeAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calculates summary averages and grouped wait-time analytics', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            queue_entry_id: 'queue-1',
            clinic_id: 'clinic-a',
            clinic_name: 'Alpha Clinic',
            queue_date: '2026-05-08',
            joined_hour: 8,
            wait_minutes: 20,
            consultation_minutes: 10
          },
          {
            queue_entry_id: 'queue-2',
            clinic_id: 'clinic-a',
            clinic_name: 'Alpha Clinic',
            queue_date: '2026-05-08',
            joined_hour: 9,
            wait_minutes: 40,
            consultation_minutes: 20
          },
          {
            queue_entry_id: 'queue-3',
            clinic_id: 'clinic-b',
            clinic_name: 'Beta Clinic',
            queue_date: '2026-05-09',
            joined_hour: 8,
            wait_minutes: 10,
            consultation_minutes: 30
          }
        ],
        error: null
      })
    );

    const result = await fetchWaitTimeAnalytics();

    expect(result).toEqual({
      averageWaitMinutes: 23.33,
      averageConsultationMinutes: 20,
      completedQueueCount: 3,
      byClinic: [
        {
          clinicId: 'clinic-a',
          clinicName: 'Alpha Clinic',
          completedQueueCount: 2,
          averageWaitMinutes: 30,
          averageConsultationMinutes: 15
        },
        {
          clinicId: 'clinic-b',
          clinicName: 'Beta Clinic',
          completedQueueCount: 1,
          averageWaitMinutes: 10,
          averageConsultationMinutes: 30
        }
      ],
      byHour: [
        {
          hour: 8,
          completedQueueCount: 2,
          averageWaitMinutes: 15,
          averageConsultationMinutes: 20
        },
        {
          hour: 9,
          completedQueueCount: 1,
          averageWaitMinutes: 40,
          averageConsultationMinutes: 20
        }
      ],
      byDate: [
        {
          date: '2026-05-08',
          completedQueueCount: 2,
          averageWaitMinutes: 30,
          averageConsultationMinutes: 15
        },
        {
          date: '2026-05-09',
          completedQueueCount: 1,
          averageWaitMinutes: 10,
          averageConsultationMinutes: 30
        }
      ]
    });

    expect(supabase.from).toHaveBeenCalledWith('analytics_wait_time_events');
  });

  test('returns an empty analytics response when no rows exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [],
        error: null
      })
    );

    const result = await fetchWaitTimeAnalytics();

    expect(result).toEqual({
      averageWaitMinutes: 0,
      averageConsultationMinutes: 0,
      completedQueueCount: 0,
      byClinic: [],
      byHour: [],
      byDate: []
    });
  });

  test('applies clinic, date range, and hour filters to the Supabase query', async () => {
    const query = createMockQuery({
      data: [],
      error: null
    });

    supabase.from.mockReturnValueOnce(query);

    await fetchWaitTimeAnalytics({
      clinicId: ' clinic-1 ',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      hour: '8'
    });

    expect(query.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1');
    expect(query.gte).toHaveBeenCalledWith('queue_date', '2026-05-01');
    expect(query.lte).toHaveBeenCalledWith('queue_date', '2026-05-31');
    expect(query.eq).toHaveBeenCalledWith('joined_hour', 8);
  });

  test('ignores invalid analytics rows defensively', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            queue_entry_id: 'queue-invalid',
            clinic_id: 'clinic-a',
            clinic_name: 'Alpha Clinic',
            queue_date: '2026-05-08',
            joined_hour: 8,
            wait_minutes: null,
            consultation_minutes: 10
          },
          {
            queue_entry_id: 'queue-valid',
            clinic_id: 'clinic-a',
            clinic_name: 'Alpha Clinic',
            queue_date: '2026-05-08',
            joined_hour: 8,
            wait_minutes: 25,
            consultation_minutes: 15
          }
        ],
        error: null
      })
    );

    const result = await fetchWaitTimeAnalytics();

    expect(result.completedQueueCount).toBe(1);
    expect(result.averageWaitMinutes).toBe(25);
    expect(result.averageConsultationMinutes).toBe(15);
  });

  test('rejects invalid date filters before querying Supabase', async () => {
    await expect(
      fetchWaitTimeAnalytics({
        startDate: '2026/05/01'
      })
    ).rejects.toMatchObject({
      message: 'startDate must be in YYYY-MM-DD format.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid date ranges before querying Supabase', async () => {
    await expect(
      fetchWaitTimeAnalytics({
        startDate: '2026-05-31',
        endDate: '2026-05-01'
      })
    ).rejects.toMatchObject({
      message: 'startDate cannot be after endDate.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid hour filters before querying Supabase', async () => {
    await expect(
      fetchWaitTimeAnalytics({
        hour: '24'
      })
    ).rejects.toMatchObject({
      message: 'hour must be a whole number between 0 and 23.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws a service error when Supabase fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Database unavailable' }
      })
    );

    await expect(fetchWaitTimeAnalytics()).rejects.toMatchObject({
      message: 'Failed to fetch wait-time analytics.',
      statusCode: 500
    });
  });
});