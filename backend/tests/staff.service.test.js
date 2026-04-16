// Mock the Supabase client before importing the staff service.
// This keeps the tests fast and avoids real database calls.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const { createStaffRequest } = require('../src/modules/staff/staff.service');

/**
 * Creates a fake Supabase query builder.
 * Each chained method returns the same query object so the service can call
 * .select().eq().in().limit() etc without touching the real database.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    limit: jest.fn(() => query),
    insert: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('createStaffRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when required fields are missing', async () => {
    await expect(
      createStaffRequest({
        userId: 'user-1',
        fullName: 'Tyron Test',
        clinicId: 'clinic-1'
      })
    ).rejects.toMatchObject({
      message: 'user_id, full_name, clinic_id, and staff_id are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws an error when duplicate-check query fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Database unavailable' }
      })
    );

    await expect(
      createStaffRequest({
        userId: 'user-1',
        fullName: 'Tyron Test',
        clinicId: 'clinic-1',
        staffId: 'STAFF-001'
      })
    ).rejects.toMatchObject({
      message: 'Failed to check existing staff request.',
      statusCode: 500
    });
  });

  test('blocks a duplicate pending staff request', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'request-1',
            user_id: 'user-1',
            status: 'pending'
          }
        ],
        error: null
      })
    );

    await expect(
      createStaffRequest({
        userId: 'user-1',
        fullName: 'Tyron Test',
        clinicId: 'clinic-1',
        staffId: 'STAFF-001'
      })
    ).rejects.toMatchObject({
      message: 'A staff registration request is already pending approval.',
      statusCode: 409
    });
  });

  test('blocks a user who is already approved as staff', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'request-1',
            user_id: 'user-1',
            status: 'approved'
          }
        ],
        error: null
      })
    );

    await expect(
      createStaffRequest({
        userId: 'user-1',
        fullName: 'Tyron Test',
        clinicId: 'clinic-1',
        staffId: 'STAFF-001'
      })
    ).rejects.toMatchObject({
      message: 'This user is already approved as staff.',
      statusCode: 409
    });
  });

  test('creates a pending staff request when the user has no active request', async () => {
    const createdRequest = {
      id: 'request-1',
      user_id: 'user-1',
      full_name: 'Tyron Test',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-001',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      created_at: '2026-04-16T10:00:00Z',
      updated_at: '2026-04-16T10:00:00Z'
    };

    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: [],
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: createdRequest,
          error: null
        })
      );

    const result = await createStaffRequest({
      userId: 'user-1',
      fullName: '  Tyron Test  ',
      clinicId: 'clinic-1',
      staffId: '  STAFF-001  '
    });

    expect(result).toEqual(createdRequest);
    expect(result.status).toBe('pending');

    expect(supabase.from).toHaveBeenCalledWith('staff_requests');
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  test('throws an error when staff request insert fails', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: [],
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Insert failed' }
        })
      );

    await expect(
      createStaffRequest({
        userId: 'user-1',
        fullName: 'Tyron Test',
        clinicId: 'clinic-1',
        staffId: 'STAFF-001'
      })
    ).rejects.toMatchObject({
      message: 'Failed to create staff registration request.',
      statusCode: 500
    });
  });
});