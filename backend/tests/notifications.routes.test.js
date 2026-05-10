// Mock the controller so this route unit test does not import reminder job dependencies.
jest.mock('../src/modules/notifications/notifications.controller', () => ({
  runAppointmentReminderJob: jest.fn()
}));

const {
  requireInternalJobToken
} = require('../src/modules/notifications/notifications.routes');

function createMockResponse() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res)
  };

  return res;
}

describe('notifications.routes requireInternalJobToken', () => {
  const originalJobToken = process.env.INTERNAL_JOB_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_JOB_TOKEN = 'test-job-token';
  });

  afterAll(() => {
    process.env.INTERNAL_JOB_TOKEN = originalJobToken;
  });

  test('rejects a missing job token', () => {
    const req = {
      headers: {}
    };
    const res = createMockResponse();
    const next = jest.fn();

    requireInternalJobToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid job token.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an invalid job token', () => {
    const req = {
      headers: {
        'x-job-token': 'wrong-token'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    requireInternalJobToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid job token.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('allows a valid job token through to the controller', () => {
    const req = {
      headers: {
        'x-job-token': 'test-job-token'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    requireInternalJobToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('rejects requests when INTERNAL_JOB_TOKEN is not configured', () => {
    delete process.env.INTERNAL_JOB_TOKEN;

    const req = {
      headers: {
        'x-job-token': 'test-job-token'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    requireInternalJobToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid job token.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});