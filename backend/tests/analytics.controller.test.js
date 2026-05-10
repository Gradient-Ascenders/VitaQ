jest.mock('../src/modules/analytics/analytics.service', () => ({
  fetchWaitTimeAnalytics: jest.fn(),
  fetchNoShowAnalytics: jest.fn()
}));

const {
  fetchWaitTimeAnalytics,
  fetchNoShowAnalytics
} = require('../src/modules/analytics/analytics.service');

const {
  getWaitTimeAnalytics,
  getNoShowAnalytics
} = require('../src/modules/analytics/analytics.controller');

/**
 * Creates a minimal fake Express response object.
 */
function createMockResponse() {
  const res = {};

  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);

  return res;
}

describe('analytics controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWaitTimeAnalytics', () => {
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

    test('returns the service error status and message when wait-time fetching fails', async () => {
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

  describe('getNoShowAnalytics', () => {
    test('returns no-show analytics successfully', async () => {
      const analytics = {
        totalAppointments: 3,
        noShowCount: 1,
        attendedQueueCount: 2,
        noShowRate: 33.33,
        byClinic: [],
        byDate: []
      };

      fetchNoShowAnalytics.mockResolvedValueOnce(analytics);

      const req = {
        query: {
          clinicId: 'clinic-1'
        }
      };
      const res = createMockResponse();

      await getNoShowAnalytics(req, res);

      expect(fetchNoShowAnalytics).toHaveBeenCalledWith(req.query);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: analytics
      });
    });

    test('returns the service error status and message when no-show fetching fails', async () => {
      const error = new Error('Failed to fetch no-show analytics.');
      error.statusCode = 500;

      fetchNoShowAnalytics.mockRejectedValueOnce(error);

      const req = {
        query: {
          clinicId: 'clinic-1'
        }
      };
      const res = createMockResponse();

      await getNoShowAnalytics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch no-show analytics.'
      });
    });
  });
});