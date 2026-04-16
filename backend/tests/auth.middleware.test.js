// Mock the Supabase client before importing the auth middleware.
jest.mock('../src/lib/supabaseClient', () => ({
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const authMiddleware = require('../src/middleware/auth');

/**
 * Creates a fake Express response object.
 * This lets us check status codes and JSON responses.
 */
function createMockResponse() {
  const res = {};

  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);

  return res;
}

/**
 * Creates a fake Supabase profile query.
 * Used for testing the requireStaff middleware.
 */
function createMockProfileQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result))
  };

  return query;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks requests without an authorization header', async () => {
    const req = {
      headers: {}
    };
    const res = createMockResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication token is required.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks requests with an invalid token', async () => {
    const req = {
      headers: {
        authorization: 'Bearer invalid-token'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    supabase.auth.getUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid token' }
    });

    await authMiddleware(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('invalid-token');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches the authenticated user and continues when the token is valid', async () => {
    const req = {
      headers: {
        authorization: 'Bearer valid-token'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    supabase.auth.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-1',
          email: 'staff@example.com'
        }
      },
      error: null
    });

    await authMiddleware(req, res, next);

    expect(req.user).toEqual({
      id: 'user-1',
      email: 'staff@example.com'
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('authMiddleware.requireStaff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks staff check when no authenticated user exists', async () => {
    const req = {};
    const res = createMockResponse();
    const next = jest.fn();

    await authMiddleware.requireStaff(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication is required before checking staff access.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks access when the user profile does not exist', async () => {
    const req = {
      user: {
        id: 'user-1'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    supabase.from.mockReturnValueOnce(
      createMockProfileQuery({
        data: null,
        error: { message: 'Profile not found' }
      })
    );

    await authMiddleware.requireStaff(req, res, next);

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Staff access is required.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks access when the user is not staff', async () => {
    const req = {
      user: {
        id: 'patient-1'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    supabase.from.mockReturnValueOnce(
      createMockProfileQuery({
        data: {
          role: 'patient'
        },
        error: null
      })
    );

    await authMiddleware.requireStaff(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Staff access is required.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('allows access when the user has a staff role', async () => {
    const req = {
      user: {
        id: 'staff-1'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    supabase.from.mockReturnValueOnce(
      createMockProfileQuery({
        data: {
          role: 'staff'
        },
        error: null
      })
    );

    await authMiddleware.requireStaff(req, res, next);

    expect(req.userRole).toBe('staff');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});