jest.mock('../src/modules/analytics/analytics.service', () => ({
  fetchWaitTimeAnalytics: jest.fn()
}));

const { fetchWaitTimeAnalytics } = require('../src/modules/analytics/analytics.service');
const { getWaitTimeAnalytics } = require('../src/modules/analytics/analytics.controller');

/**
 * Creates a minimal fake Express response object.
 */
function createMockResponse() {
  const res = {};

  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);

  return res;
}

describe('getWaitTimeAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns wait-time analytics successfully', async () => {
    const analytics = {
      averageWaitMinutes: 25,
      averageConsultationMinutes: 20,
      completedQueueCount: 1,
      byClinic: [],
      byHour: [],
      byDate: []
    };

    fetchWaitTimeAnalytics.mockResolvedValueOnce(analytics);

    const req = {
      query: {
        clinicId: 'clinic-1'
      }
    };
    const res = createMockResponse();

    await getWaitTimeAnalytics(req, res);

    expect(fetchWaitTimeAnalytics).toHaveBeenCalledWith(req.query);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: analytics
    });
  });

  test('returns the service error status and message when analytics fetching fails', async () => {
    const error = new Error('startDate cannot be after endDate.');
    error.statusCode = 400;

    fetchWaitTimeAnalytics.mockRejectedValueOnce(error);

    const req = {
      query: {
        startDate: '2026-05-31',
        endDate: '2026-05-01'
      }
    };
    const res = createMockResponse();

    await getWaitTimeAnalytics(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'startDate cannot be after endDate.'
    });
  });
});